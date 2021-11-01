const qs = require('qs');
const crypto = require('crypto');
const moment = require('moment');
const Request = require('../../_shared-classes/request');
/**
 * 
 * 
 * 
 * =================================
 * HELPER FUNCTIONS
 * =================================
 * 
 * 
 * 
 */
/**
 * @param {RestApi.params} params
 * @param {Object | string} responseData 
 * @returns {{ error: RestApi.RestErrorResponseData }}
 */
function handleResponseError(params, responseData) {
  /** @type {RestApi.restErrorResponseDataType} */
  let type = 'unknown';
  if (responseData.error_code) {
    const errorCode = responseData.error_code;
    if (errorCode === '32003') {
      type = 'order-not-found';
    }
    if (errorCode === '30014' || errorCode === '30026') {
      type = 'api-rate-limit';
    }
    if (errorCode === '30008' || errorCode === '30009' || errorCode === '32012'
      || errorCode === '30030' || errorCode === '32030' || errorCode === '32047'
      || errorCode === '32055' || errorCode === '32095') {
      type = 'request-not-accepted';
    }
    if (errorCode === '32067' || errorCode === '32069' || errorCode === '32072'
      || errorCode === '32077' || errorCode === '32099') {
      type = 'insufficient-funds';
    }
  }
  if (responseData.code === 'ETIMEDOUT' || responseData.code === 'ESOCKETTIMEDOUT') {
    type = 'request-timeout';
  }
  return {
    error: {
      type: type,
      params: params,
      exchange: responseData,
    }
  }
};
/**
 * @param {number} interval 
 * @returns {string | number}
 */
function getCandleResolution(interval) {
  return (interval / 1000).toString();
};
/**
 * 
 * 
 * 
 * =================================
 * REQUEST FUNCTIONS
 * =================================
 * 
 * 
 * 
 */
/** 
 * @this {RestApi.Request} 
 * @returns {Promise<RestApi.requestSendReturn>}
 */
function public(method, path, data) {
  const dataStringified = qs.stringify(data);
  const requestSendParams = {
    url: `${this.restOptions.url}${path}?${dataStringified}`,
    method: method,
  };
  return this.send(requestSendParams);
};
/** 
 * @this {RestApi.Request} 
 * @returns {Promise<RestApi.requestSendReturn>}
 */
function private(method, path, data, query) {
  const timestamp = moment.utc().format('YYYY-MM-DD[T]HH:mm:ss.SSS[Z]');
  const dataStringified = data ? JSON.stringify(data) : '';
  const queryStrigified = query ? `?${qs.stringify(query)}` : '';
  const digest = `${timestamp}${method}${path}${queryStrigified}${dataStringified}`;
  const signature = crypto.createHmac('sha256', this.restOptions.apiSecret).update(digest).digest('base64');
  const requestSendParams = {
    url: `${this.restOptions.url}${path}${queryStrigified}`,
    data: dataStringified,
    method: method,
    headers: {
      'Content-Type': 'application/json',
      'OK-ACCESS-KEY': this.restOptions.apiKey,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': this.restOptions.apiPassphrase,
    },
  };
  return this.send(requestSendParams);
};
/**
 * 
 * 
 * 
 * =================================
 * REST DEFINITION
 * =================================
 * 
 * 
 * 
 */
/** 
 * @param {RestApi.restOptions} [restOptions] 
 */
function Rest(restOptions) {
  // Default restOptions values
  restOptions = restOptions || {};
  restOptions.url = restOptions.url || 'https://www.okex.com';
  restOptions.apiKey = restOptions.apiKey || '';
  restOptions.apiSecret = restOptions.apiSecret || '';
  restOptions.apiPassphrase = restOptions.apiPassphrase || '';
  restOptions.requestsLimit = restOptions.requestsLimit || 120;
  restOptions.requestsTimestamps = restOptions.requestsTimestamps || 10;
  restOptions.requestsRefill = restOptions.requestsRefill || 0;
  restOptions.requestsRefillType = restOptions.requestsRefillType || '';
  restOptions.requestsRefillInterval = restOptions.requestsRefillInterval || 0;
  // Request creation
  const request = Request({ restOptions, public, private });
  /** 
   * 
   * 
   * @type {RestApi.Rest} 
   * 
   * 
   */
  const rest = {
    /**
     * 
     * 
     * REQUEST
     * 
     * 
     */
    request: request,
    /**
     * 
     * 
     * CREATE ORDER
     * 
     * 
     */
    createOrder: async (params) => {
      const data = {};
      data.client_oid = params.id;
      data.instrument_id = params.symbol;
      data.size = `${params.quantity}`;
      data.type = params.direction === 'open'
        ? (params.side === 'sell' ? '2' : '1')
        : (params.side === 'sell' ? '3' : '4');
      if (params.type === 'market') {
        data.order_type = '4';
      }
      if (params.type === 'limit') {
        data.price = `${params.price}`;
        data.order_type = '1';
      }
      const response = await request.private('POST', '/api/futures/v3/order', data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data);
      }
      return { data: params };
    },
    /**
     * 
     * 
     * CREATE ORDERS
     * 
     * 
     */
    createOrders: async (params) => {
      const data = {};
      data.instrument_id = params[0].symbol;
      data.orders_data = params.map(v => {
        const orderData = {};
        orderData.client_oid = v.id;
        orderData.instrument_id = v.symbol;
        orderData.size = `${v.quantity}`;
        orderData.type = v.direction === 'open'
          ? (v.side === 'sell' ? '2' : '1')
          : (v.side === 'sell' ? '3' : '4');
        if (v.type === 'market') {
          orderData.order_type = '4';
        }
        if (v.type === 'limit') {
          orderData.price = `${v.price}`;
          orderData.order_type = '1';
        }
      });
      const response = await request.private('POST', '/api/futures/v3/orders', data);
      if (response.status >= 400) {
        return params.map(v => handleResponseError(v, response.data));
      }
      return response.data.order_info.map((v, i) => {
        if (v.error_code !== '0') {
          return handleResponseError(params[i], v);
        }
        return { data: params[i] };
      });
    },
    /**
     * 
     * 
     * CANCEL ORDER
     * 
     * 
     */
    cancelOrder: async (params) => {
      const data = {};
      const response = await request.private('POST', `/api/futures/v3/cancel_order/${params.symbol}/${params.id}`, data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data);
      }
      return { data: params };
    },
    /**
     * 
     * 
     * CANCEL ORDERS
     * 
     * 
     */
    cancelOrders: async (params) => {
      const data = {};
      data.client_oids = params.map(v => v.id);
      const response = await request.private('POST', `/api/futures/v3/cancel_batch_orders/${params[0].symbol}`, data);
      if (response.status >= 400) {
        return params.map(v => handleResponseError(v, response.data));
      }
      return response.data.order_info.map((v, i) => {
        if (v.error_code !== '0') {
          return handleResponseError(params[i], v);
        }
        return { data: params[i] };
      });
    },
    /**
     * 
     * 
     * CANCEL ORDERS ALL
     * 
     * 
     */
    cancelOrdersAll: async (params) => {
      // Get open orders
      const ordersData = {};
      ordersData.state = '6';
      const ordersResponse = await request.private('GET', `/api/futures/v3/orders/${params.symbol}`, ordersData);
      if (ordersResponse.status >= 400) {
        return handleResponseError(params, ordersResponse.data);
      }
      if (!ordersResponse.data.order_info.length) {
        return { data: params }
      };
      // Cancel open orders
      const cancelData = {};
      cancelData.order_ids = ordersResponse.data.order_info.map(v => v.order_id);
      const cancelResponse = await request.private('POST', `/api/futures/v3/cancel_batch_orders/${params.symbol}`, cancelData);
      if (cancelResponse.status >= 400) {
        return handleResponseError(params, cancelResponse.data);
      }
      return { data: params };
    },
    /**
     * 
     * 
     * UPDATE ORDER
     * 
     * 
     */
    updateOrder: async (params) => {
      const data = {};
      data.client_oid = params.id;
      data.new_size = `${params.quantity}`;
      data.new_price = `${params.price}`;
      const response = await request.private('POST', `/api/futures/v3/amend_order/${params.symbol}`, data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data);
      }
      return { data: params };
    },
    /**
     * 
     * 
     * UPDATE ORDERS
     * 
     * 
     */
    updateOrders: async (params) => {
      const data = {};
      data.amend_data = params.map(v => {
        const orderData = {};
        orderData.client_oid = v.id;
        orderData.new_size = v.quantity;
        orderData.new_price = v.price;
        return orderData;
      });
      const response = await request.private('POST', `/api/futures/v3/amend_batch_orders/${params[0].symbol}`, data);
      if (response.status >= 400) {
        return params.map(v => handleResponseError(v, response.data));
      }
      return response.data.map((v, i) => {
        if (v.error_code !== '0') {
          return handleResponseError(params[i], v);
        }
        return { data: params[i] };
      });
    },
    /**
     * 
     * 
     * GET EQUITY
     * 
     * 
     */
    getEquity: async (params) => {
      const data = {};
      const response = await request.private('GET', `/api/futures/v3/accounts/${params.symbol}`, data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data);
      }
      const equity = +response.data.equity;
      return { data: equity };
    },
    /**
     * 
     * 
     * GET CANDLES
     * 
     * 
     */
    getCandles: async (params) => {
      const data = {};
      data.instrument_id = params.symbol;
      data.end = moment.utc(params.start).format();
      data.granularity = getCandleResolution(params.interval);
      data.limit = '300';
      const response = await request.public('GET', `/api/futures/v3/instruments/${params.symbol}/history/candles`, data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data);
      }
      const candles = response.data.map(v => {
        const candle = {};
        candle.timestamp = moment(v[0]).utc().format('YYYY-MM-DD HH:mm:ss');
        candle.open = +v[1];
        candle.high = +v[2];
        candle.low = +v[3];
        candle.close = +v[4];
        candle.volume = +v[5];
        return candle;
      });
      return { data: candles };
    },
    /**
     * 
     * 
     * GET POSITION
     * 
     * 
     */
    getPosition: async (params) => {
      const data = {};
      const response = await request.private('GET', `/api/futures/v3/${params.symbol}/position`, data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data);
      }
      const positionHolding = response.data.holding[0];
      const qtyS = +positionHolding.short_qty;
      const qtyB = +positionHolding.long_qty;
      const pxS = +positionHolding.short_qty ? +positionHolding.short_avg_cost : 0;
      const pxB = +positionHolding.long_qty ? +positionHolding.long_avg_cost : 0;
      const position = { qtyS, qtyB, pxS, pxB };
      return { data: position };
    },
    /**
     * 
     * 
     * GET LAST PRICE
     * 
     * 
     */
    getLastPrice: async (params) => {
      const data = {};
      const response = await request.public('GET', `/api/futures/v3/instruments/${params.symbol}/ticker`, data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data);
      }
      const price = +response.data.ticker;
      return { data: price };
    },
    /**
     * 
     * 
     * GET LIQUIDATION
     * 
     * 
     */
    getLiquidation: async (params) => {
      // Get mark price 
      const markData = {};
      const markResponse = await request.public('GET', `/api/futures/v3/instruments/${params.symbol}`, markData);
      if (markResponse.status >= 400) {
        return handleResponseError(params, markResponse.data);
      }
      // Get position
      const positionData = {};
      const positionResponse = await request.private('GET', `/api/futures/v3/${params.symbol}/position`, positionData);
      if (positionResponse.status >= 400) {
        return handleResponseError(params, positionResponse.data);
      }
      // Calculate liquidation
      const positionHolding = positionResponse.data.holding[0];
      const markPx = +markResponse.data.mark_price;
      const liqPxS = +positionHolding.short_qty ? +positionHolding.liquidation_price : 0;
      const liqPxB = +positionHolding.long_qty ? +positionHolding.liquidation_price : 0;
      const liquidation = { markPx, liqPxS, liqPxB, };
      return { data: liquidation };
    },
    /**
     * 
     * 
     * GET FUNDING RATES
     * 
     * 
     */
    getFundingRates: async (params) => {
      const fundings = { current: 0, estimated: 0 };
      return { data: fundings };
    },
  };
  return rest;
};
module.exports = Rest;
