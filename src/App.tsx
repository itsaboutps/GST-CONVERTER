import React, { useState } from 'react';
import { FileUp, Download, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { transformExcelData } from './utils/transformExcelData';
import { transformToGSTR1 } from './utils/transformGSTR1';

interface MonthData {
  month: string;
  forwardFile: File | null;
  reverseFile: File | null;
}

interface FormData {
  returnType: 'monthly' | 'quarterly';
  year: string;
  gstNumber: string;
  selectedQuarter?: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  monthlyData: {
    month: string;
    forwardFile: File | null;
    reverseFile: File | null;
  };
  quarterlyData: {
    [key: string]: MonthData;
  };
}

function App() {
  const [formData, setFormData] = useState<FormData>({
    returnType: 'monthly',
    year: new Date().getFullYear().toString(),
    gstNumber: '',
    monthlyData: {
      month: '',
      forwardFile: null,
      reverseFile: null
    },
    quarterlyData: {}
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quarters = {
    Q1: ['April', 'May', 'June'],
    Q2: ['July', 'August', 'September'],
    Q3: ['October', 'November', 'December'],
    Q4: ['January', 'February', 'March']
  };

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    if (name === 'returnType') {
      setFormData(prev => ({
        ...prev,
        [name]: value,
        selectedQuarter: undefined,
        quarterlyData: {},
        monthlyData: {
          month: '',
          forwardFile: null,
          reverseFile: null
        }
      }));
    } else if (name === 'selectedQuarter') {
      const quarterMonths = quarters[value as keyof typeof quarters];
      const newQuarterlyData: { [key: string]: MonthData } = {};
      quarterMonths.forEach(month => {
        newQuarterlyData[month] = {
          month,
          forwardFile: null,
          reverseFile: null
        };
      });
      setFormData(prev => ({
        ...prev,
        selectedQuarter: value as 'Q1' | 'Q2' | 'Q3' | 'Q4',
        quarterlyData: newQuarterlyData
      }));
    } else if (name === 'month') {
      setFormData(prev => ({
        ...prev,
        monthlyData: {
          ...prev.monthlyData,
          month: value,
          forwardFile: null,
          reverseFile: null
        }
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleMonthlyFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'forwardFile' | 'reverseFile') => {
    const file = e.target.files?.[0];
    if (file && !file.name.match(/\.(xlsx|xls)$/)) {
      setError('Please upload only Excel files (.xlsx or .xls)');
      return;
    }
    setFormData(prev => ({
      ...prev,
      monthlyData: {
        ...prev.monthlyData,
        [type]: file
      }
    }));
    setError(null);
  };

  const handleQuarterlyFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    month: string,
    type: 'forwardFile' | 'reverseFile'
  ) => {
    const file = e.target.files?.[0];
    if (file && !file.name.match(/\.(xlsx|xls)$/)) {
      setError('Please upload only Excel files (.xlsx or .xls)');
      return;
    }
    setFormData(prev => ({
      ...prev,
      quarterlyData: {
        ...prev.quarterlyData,
        [month]: {
          ...prev.quarterlyData[month],
          month,
          [type]: file
        }
      }
    }));
    setError(null);
  };

  const processExcelFile = async (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(sheet);
          resolve(jsonData);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = (error) => reject(error);
      reader.readAsBinaryString(file);
    });
  };

  const validateQuarterlyData = () => {
    const quarterMonths = quarters[formData.selectedQuarter!];
    return quarterMonths.every(month => {
      const monthData = formData.quarterlyData[month];
      return monthData?.forwardFile && monthData?.reverseFile;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (formData.returnType === 'monthly') {
        if (!formData.monthlyData.forwardFile || !formData.monthlyData.reverseFile) {
          throw new Error('Please upload both forward and reverse Excel files');
        }

        const forwardData = await processExcelFile(formData.monthlyData.forwardFile);
        const reverseData = await processExcelFile(formData.monthlyData.reverseFile);

        console.log('Forward Data:', forwardData);
        console.log('Reverse Data:', reverseData);

        // Format period as MMYYYY
        const month = String(months.indexOf(formData.monthlyData.month) + 1).padStart(2, '0');
        const period = `${month}${formData.year}`;

        const combinedData = [...forwardData, ...reverseData];
        console.log('Combined Data:', combinedData);

        const gstr1Data = transformToGSTR1(
          combinedData,
          formData.gstNumber,
          period
        );

        console.log('Transformed Data:', gstr1Data);

        if (!gstr1Data.b2cs.length && !gstr1Data.supeco.clttx.length) {
          throw new Error('No data was processed. Please check the Excel files format.');
        }

        downloadJSON(gstr1Data, `gstr1-b2cs-${formData.monthlyData.month}-${formData.year}`);
      } else {
        if (!formData.selectedQuarter || !validateQuarterlyData()) {
          throw new Error('Please upload all required Excel files for the selected quarter');
        }

        const allData: any[] = [];
        for (const month of quarters[formData.selectedQuarter]) {
          const monthData = formData.quarterlyData[month];
          const forwardData = await processExcelFile(monthData.forwardFile!);
          const reverseData = await processExcelFile(monthData.reverseFile!);
          allData.push(...forwardData, ...reverseData);
        }

        // Get the last month of the quarter for period
        const lastMonth = quarters[formData.selectedQuarter].slice(-1)[0];
        const month = String(months.indexOf(lastMonth) + 1).padStart(2, '0');
        const period = `${month}${formData.year}`;

        const gstr1Data = transformToGSTR1(
          allData,
          formData.gstNumber,
          period
        );

        downloadJSON(gstr1Data, `gstr1-b2cs-${formData.selectedQuarter}-${formData.year}`);
      }
    } catch (err) {
      console.error('Error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred while processing the files');
    } finally {
      setLoading(false);
    }
  };

  const downloadJSON = (data: any, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <FileSpreadsheet className="w-16 h-16 mx-auto text-indigo-600 mb-4" />
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Excel to JSON Converter</h1>
            <p className="text-lg text-gray-600">Convert your GST Excel sheets into structured JSON format</p>
          </div>

          {/* Main Form */}
          <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-lg p-8">
            {/* Return Type Selection */}
            <div className="mb-8">
              <label className="block text-sm font-medium text-gray-700 mb-2">Return Type</label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => handleInputChange({ target: { name: 'returnType', value: 'monthly' } } as any)}
                  className={`p-4 text-center rounded-lg border-2 ${
                    formData.returnType === 'monthly'
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  Monthly Return
                </button>
                <button
                  type="button"
                  onClick={() => handleInputChange({ target: { name: 'returnType', value: 'quarterly' } } as any)}
                  className={`p-4 text-center rounded-lg border-2 ${
                    formData.returnType === 'quarterly'
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  Quarterly Return
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {/* Year Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Year</label>
                <input
                  type="number"
                  name="year"
                  value={formData.year}
                  onChange={handleInputChange}
                  required
                  min="2000"
                  max="2100"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              {/* Month/Quarter Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {formData.returnType === 'monthly' ? 'Month' : 'Quarter'}
                </label>
                <select
                  name={formData.returnType === 'monthly' ? 'month' : 'selectedQuarter'}
                  value={formData.returnType === 'monthly' ? formData.monthlyData.month : formData.selectedQuarter}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="">Select {formData.returnType === 'monthly' ? 'Month' : 'Quarter'}</option>
                  {formData.returnType === 'monthly'
                    ? months.map(month => (
                        <option key={month} value={month}>{month}</option>
                      ))
                    : Object.keys(quarters).map(quarter => (
                        <option key={quarter} value={quarter}>{quarter} ({quarters[quarter as keyof typeof quarters].join(', ')})</option>
                      ))
                  }
                </select>
              </div>
            </div>

            {/* GST Number */}
            <div className="mb-8">
              <label className="block text-sm font-medium text-gray-700 mb-2">GST Number</label>
              <input
                type="text"
                name="gstNumber"
                value={formData.gstNumber}
                onChange={handleInputChange}
                required
                pattern="^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$"
                placeholder="Enter your 15-digit GST number"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            {/* File Upload Section */}
            <div className="space-y-6 mb-8">
              {formData.returnType === 'monthly' ? (
                <>
                  {/* Monthly File Uploads */}
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
                    <div className="flex items-center justify-center">
                      <label className="w-full cursor-pointer">
                        <div className="flex flex-col items-center justify-center">
                          <FileUp className="w-12 h-12 text-gray-400" />
                          <span className="mt-2 text-base text-gray-600">Upload Forward Excel Sheet</span>
                          <span className="mt-1 text-sm text-gray-500">
                            {formData.monthlyData.forwardFile ? formData.monthlyData.forwardFile.name : 'XLSX, XLS up to 10MB'}
                          </span>
                        </div>
                        <input
                          type="file"
                          className="hidden"
                          accept=".xlsx,.xls"
                          onChange={(e) => handleMonthlyFileChange(e, 'forwardFile')}
                          required
                        />
                      </label>
                    </div>
                  </div>

                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
                    <div className="flex items-center justify-center">
                      <label className="w-full cursor-pointer">
                        <div className="flex flex-col items-center justify-center">
                          <FileUp className="w-12 h-12 text-gray-400" />
                          <span className="mt-2 text-base text-gray-600">Upload Reverse Excel Sheet</span>
                          <span className="mt-1 text-sm text-gray-500">
                            {formData.monthlyData.reverseFile ? formData.monthlyData.reverseFile.name : 'XLSX, XLS up to 10MB'}
                          </span>
                        </div>
                        <input
                          type="file"
                          className="hidden"
                          accept=".xlsx,.xls"
                          onChange={(e) => handleMonthlyFileChange(e, 'reverseFile')}
                          required
                        />
                      </label>
                    </div>
                  </div>
                </>
              ) : (
                /* Quarterly File Uploads */
                formData.selectedQuarter && (
                  <div className="space-y-8">
                    {quarters[formData.selectedQuarter].map((month) => (
                      <div key={month} className="border-2 rounded-lg p-6">
                        <h3 className="text-lg font-semibold mb-4">{month}</h3>
                        <div className="space-y-4">
                          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
                            <div className="flex items-center justify-center">
                              <label className="w-full cursor-pointer">
                                <div className="flex flex-col items-center justify-center">
                                  <FileUp className="w-12 h-12 text-gray-400" />
                                  <span className="mt-2 text-base text-gray-600">Upload Forward Excel Sheet</span>
                                  <span className="mt-1 text-sm text-gray-500">
                                    {formData.quarterlyData[month]?.forwardFile?.name || 'XLSX, XLS up to 10MB'}
                                  </span>
                                </div>
                                <input
                                  type="file"
                                  className="hidden"
                                  accept=".xlsx,.xls"
                                  onChange={(e) => handleQuarterlyFileChange(e, month, 'forwardFile')}
                                  required
                                />
                              </label>
                            </div>
                          </div>

                          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
                            <div className="flex items-center justify-center">
                              <label className="w-full cursor-pointer">
                                <div className="flex flex-col items-center justify-center">
                                  <FileUp className="w-12 h-12 text-gray-400" />
                                  <span className="mt-2 text-base text-gray-600">Upload Reverse Excel Sheet</span>
                                  <span className="mt-1 text-sm text-gray-500">
                                    {formData.quarterlyData[month]?.reverseFile?.name || 'XLSX, XLS up to 10MB'}
                                  </span>
                                </div>
                                <input
                                  type="file"
                                  className="hidden"
                                  accept=".xlsx,.xls"
                                  onChange={(e) => handleQuarterlyFileChange(e, month, 'reverseFile')}
                                  required
                                />
                              </label>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-700">
                <p className="text-sm">{error}</p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className={`w-full flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
                loading ? 'opacity-75 cursor-not-allowed' : ''
              }`}
            >
              {loading ? (
                <span>Processing...</span>
              ) : (
                <>
                  <Download className="w-5 h-5 mr-2" />
                  Convert and Download JSON
                </>
              )}
            </button>
          </form>

          {/* Features Section */}
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 bg-white rounded-lg shadow">
              <h3 className="text-lg font-semibold mb-2">Secure Processing</h3>
              <p className="text-gray-600">Your data is processed locally in your browser for maximum security</p>
            </div>
            <div className="p-6 bg-white rounded-lg shadow">
              <h3 className="text-lg font-semibold mb-2">Fast Conversion</h3>
              <p className="text-gray-600">Convert large Excel files to JSON format in seconds</p>
            </div>
            <div className="p-6 bg-white rounded-lg shadow">
              <h3 className="text-lg font-semibold mb-2">Easy Download</h3>
              <p className="text-gray-600">Get your converted JSON file with a single click</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;