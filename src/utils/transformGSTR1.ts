interface ExcelRow {
  month: string;
  order_date: string;
  identifier: string;
  order_num: string;
  sub_order_num: string;
  quantity: number;
  order_status: string;
  manifesttime: string;
  sup_name: string;
  state: string;
  pin: string;
  reseller_state: string;
  reseller_pin: string;
  end_customer_state: string;
  end_customer_pin: string;
  gstin: string;
  hsn_code: string;
  gst_amount: number;
  gst_rate: number;
  meesho_price: number;
  net_commission: number;
  commission_gst: number;
  adj: number;
  shipping_charges_total: number;
  gst: number;
  taxable_shipping: number;
  shipping_gst_18_percent: number;
  meesho_price_plus_shipping_charges_total: number;
  tcs_taxable_amount: number;
  end_customer_state_new: string;
  enrollment_no: string;
  financial_year: string;
  month_number: string;
  supplier_id: string;
  penalty?: number;
  cancel_return_date?: string;
}

interface B2CSEntry {
  sply_ty: "INTER" | "INTRA";
  rt: number;
  typ: string;
  pos: string;
  txval: number;
  iamt?: number;
  camt?: number;
  samt?: number;
  csamt: number;
}

interface SupEcoEntry {
  etin: string;
  suppval: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
  flag: string;
}

interface GSTR1Data {
  gstin: string;
  fp: string;
  version: string;
  hash: string;
  b2cs: B2CSEntry[];
  supeco: {
    clttx: SupEcoEntry[];
  };
}

// Helper function to round to 2 decimal places
function round2Decimal(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

// Helper function to get state code from state name
function getStateCode(state: string): string {
  const stateCodeMap: { [key: string]: string } = {
    'Jammu and Kashmir': '01',
    'Himachal Pradesh': '02',
    'Punjab': '03',
    'Chandigarh': '04',
    'Uttarakhand': '05',
    'Haryana': '06',
    'Delhi': '07',
    'Rajasthan': '08',
    'Uttar Pradesh': '09',
    'Bihar': '10',
    'Sikkim': '11',
    'Arunachal Pradesh': '12',
    'Nagaland': '13',
    'Manipur': '14',
    'Mizoram': '15',
    'Tripura': '16',
    'Meghalaya': '17',
    'Assam': '18',
    'West Bengal': '19',
    'Jharkhand': '20',
    'Odisha': '21',
    'Chhattisgarh': '22',
    'Madhya Pradesh': '23',
    'Gujarat': '24',
    'Daman and Diu': '25',
    'Dadra and Nagar Haveli': '26',
    'Maharashtra': '27',
    'Karnataka': '29',
    'Goa': '30',
    'Lakshadweep': '31',
    'Kerala': '32',
    'Tamil Nadu': '33',
    'Puducherry': '34',
    'Andaman and Nicobar Islands': '35',
    'Telangana': '36',
    'Andhra Pradesh': '37',
    'Ladakh': '38'
  };
  return stateCodeMap[state] || '00';
}

export function transformToGSTR1(data: ExcelRow[], gstNumber: string, period: string): GSTR1Data {
  console.log('Starting transformation with:', {
    dataLength: data.length,
    gstNumber,
    period
  });

  const gstr1: GSTR1Data = {
    gstin: gstNumber,
    fp: period,
    version: "GST3.1.6",
    hash: "hash",
    b2cs: [],
    supeco: {
      clttx: []
    }
  };

  if (!data || data.length === 0) {
    console.warn('No data provided for transformation');
    return gstr1;
  }

  // Group transactions by state and tax rate
  const stateRateMap = new Map<string, Map<string, B2CSEntry>>();
  
  // Track e-commerce operator totals
  const ecoMap = new Map<string, SupEcoEntry>();

  // Initialize e-commerce operator entry
  const etin = gstNumber.substring(0, 2) + "AACCF6368D1CV";
  ecoMap.set(etin, {
    etin,
    suppval: 0,
    igst: 0,
    cgst: 0,
    sgst: 0,
    cess: 0,
    flag: "N"
  });

  data.forEach((row, index) => {
    if (!row.end_customer_state || !row.gst_rate) {
      console.warn(`Skipping row ${index} due to missing data:`, row);
      return;
    }

    console.log(`Processing row ${index}:`, {
      state: row.end_customer_state,
      gstRate: row.gst_rate,
      price: row.meesho_price,
      gstAmount: row.gst_amount
    });

    const stateCode = getStateCode(row.end_customer_state);
    const supplierStateCode = getStateCode(row.state);
    const taxRate = row.gst_rate;
    const taxableValue = row.meesho_price || 0;
    const gstAmount = row.gst_amount || 0;

    // Determine supply type based on state codes
    const isIntraState = stateCode === supplierStateCode;
    const supplyType = isIntraState ? "INTRA" : "INTER";

    // Create a unique key for the state-rate-supply type combination
    const key = `${stateCode}-${taxRate}-${supplyType}`;

    if (!stateRateMap.has(key)) {
      stateRateMap.set(key, new Map());
    }

    const entry = stateRateMap.get(key)!;
    if (!entry.has(key)) {
      const newEntry: B2CSEntry = {
        sply_ty: supplyType,
        rt: taxRate,
        typ: "OE",
        pos: stateCode,
        txval: 0,
        csamt: 0
      };

      if (isIntraState) {
        newEntry.camt = 0;
        newEntry.samt = 0;
      } else {
        newEntry.iamt = 0;
      }

      entry.set(key, newEntry);
    }

    const currentEntry = entry.get(key)!;
    currentEntry.txval = round2Decimal(currentEntry.txval + taxableValue);

    if (isIntraState) {
      const halfGst = round2Decimal(gstAmount / 2);
      currentEntry.camt = round2Decimal((currentEntry.camt || 0) + halfGst);
      currentEntry.samt = round2Decimal((currentEntry.samt || 0) + halfGst);
    } else {
      currentEntry.iamt = round2Decimal((currentEntry.iamt || 0) + gstAmount);
    }

    // Update e-commerce operator totals
    const ecoEntry = ecoMap.get(etin)!;
    ecoEntry.suppval = round2Decimal(ecoEntry.suppval + taxableValue);
    if (isIntraState) {
      const halfGst = round2Decimal(gstAmount / 2);
      ecoEntry.cgst = round2Decimal(ecoEntry.cgst + halfGst);
      ecoEntry.sgst = round2Decimal(ecoEntry.sgst + halfGst);
    } else {
      ecoEntry.igst = round2Decimal(ecoEntry.igst + gstAmount);
    }
  });

  console.log('State Rate Map:', Array.from(stateRateMap.entries()));
  console.log('Eco Map:', Array.from(ecoMap.entries()));

  // Convert grouped data to b2cs array
  stateRateMap.forEach((rateMap) => {
    rateMap.forEach((entry) => {
      if (entry.txval !== 0) {
        gstr1.b2cs.push(entry);
      }
    });
  });

  // Add e-commerce entries
  ecoMap.forEach((entry) => {
    if (entry.suppval !== 0) {
      gstr1.supeco.clttx.push(entry);
    }
  });

  // Sort b2cs array by pos (state code)
  gstr1.b2cs.sort((a, b) => a.pos.localeCompare(b.pos));

  console.log('Final GSTR1 Data:', gstr1);
  return gstr1;
}