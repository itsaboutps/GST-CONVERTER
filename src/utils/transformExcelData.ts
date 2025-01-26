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

interface TransformedData {
  totalOrders: number;
  totalAmount: number;
  gstSummary: {
    totalGSTAmount: number;
    totalTaxableAmount: number;
    gstRateWiseBreakdown: {
      [key: string]: {
        count: number;
        taxableAmount: number;
        gstAmount: number;
      };
    };
  };
  stateWiseBreakdown: {
    [key: string]: {
      count: number;
      amount: number;
      gstAmount: number;
    };
  };
  orderStatusSummary: {
    [key: string]: number;
  };
  monthlyTrends: {
    [key: string]: {
      orders: number;
      amount: number;
      gstAmount: number;
    };
  };
}

export function transformExcelData(data: ExcelRow[]): TransformedData {
  const transformed: TransformedData = {
    totalOrders: 0,
    totalAmount: 0,
    gstSummary: {
      totalGSTAmount: 0,
      totalTaxableAmount: 0,
      gstRateWiseBreakdown: {},
    },
    stateWiseBreakdown: {},
    orderStatusSummary: {},
    monthlyTrends: {},
  };

  data.forEach((row) => {
    // Count total orders
    transformed.totalOrders++;
    transformed.totalAmount += row.meesho_price || 0;

    // GST Summary
    const gstRate = row.gst_rate?.toString() || '0';
    if (!transformed.gstSummary.gstRateWiseBreakdown[gstRate]) {
      transformed.gstSummary.gstRateWiseBreakdown[gstRate] = {
        count: 0,
        taxableAmount: 0,
        gstAmount: 0,
      };
    }
    transformed.gstSummary.gstRateWiseBreakdown[gstRate].count++;
    transformed.gstSummary.gstRateWiseBreakdown[gstRate].taxableAmount += row.meesho_price || 0;
    transformed.gstSummary.gstRateWiseBreakdown[gstRate].gstAmount += row.gst_amount || 0;
    transformed.gstSummary.totalGSTAmount += row.gst_amount || 0;
    transformed.gstSummary.totalTaxableAmount += row.meesho_price || 0;

    // State-wise breakdown
    const state = row.state || 'Unknown';
    if (!transformed.stateWiseBreakdown[state]) {
      transformed.stateWiseBreakdown[state] = {
        count: 0,
        amount: 0,
        gstAmount: 0,
      };
    }
    transformed.stateWiseBreakdown[state].count++;
    transformed.stateWiseBreakdown[state].amount += row.meesho_price || 0;
    transformed.stateWiseBreakdown[state].gstAmount += row.gst_amount || 0;

    // Order status summary
    const status = row.order_status || 'Unknown';
    transformed.orderStatusSummary[status] = (transformed.orderStatusSummary[status] || 0) + 1;

    // Monthly trends
    const monthYear = `${row.month} ${row.financial_year}`;
    if (!transformed.monthlyTrends[monthYear]) {
      transformed.monthlyTrends[monthYear] = {
        orders: 0,
        amount: 0,
        gstAmount: 0,
      };
    }
    transformed.monthlyTrends[monthYear].orders++;
    transformed.monthlyTrends[monthYear].amount += row.meesho_price || 0;
    transformed.monthlyTrends[monthYear].gstAmount += row.gst_amount || 0;
  });

  return transformed;
}