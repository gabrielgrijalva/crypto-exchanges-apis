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
 * @param {import('../../../typings').RestN.params} params
 * @param {Object | string} responseData 
 * @returns {{ error: import('../../../typings').RestN.RestErrorResponseData }}
 */
function handleResponseError(params, responseData) {
  /** @type {import('../../../typings').RestN.restErrorResponseDataType} */
  let type = 'unknown';
  if (responseData.code || responseData.sCode) {
    const errorCode = responseData.code || responseData.sCode;
    if (errorCode === '50011') {
      type = 'api-rate-limit';
    }
    if (errorCode === '50102') {
      type = 'request-timeout';
    }
    if (errorCode === '50001' || errorCode === '50013' || errorCode === '50026') {
      type = 'request-not-accepted';
    }
    if (errorCode === '51008' || errorCode === '51127' || errorCode === '51131' || errorCode === '51502'
      || errorCode === '59200' || errorCode === '59303') {
      type = 'insufficient-funds';
    }
    if (errorCode === '51400' || errorCode === '51401' || errorCode === '51402' || errorCode === '51405'
      || errorCode === '51410' || errorCode === '51509' || errorCode === '51510' || errorCode === '51603') {
      type = 'order-not-found';
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
  if (interval === 60000) { return '1m' };
  if (interval === 180000) { return '3m' };
  if (interval === 300000) { return '5m' };
  if (interval === 900000) { return '15m' };
  if (interval === 1800000) { return '30m' };
  if (interval === 3600000) { return '1Hutc' };
  if (interval === 7200000) { return '2Hutc' };
  if (interval === 14400000) { return '4Hutc' };
  if (interval === 21600000) { return '6Hutc' };
  if (interval === 43200000) { return '12Hutc' };
  if (interval === 86400000) { return '1Dutc' };
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
 * @this {import('../../../typings').RestN.Request} 
 * @returns {Promise<import('../../../typings').RestN.requestSendReturn>}
 */
async function public(method, path, data) {
  const dataStringified = qs.stringify(data);
  const requestSendParams = {
    url: `${this.restOptions.url}${path}?${dataStringified}`,
    method: method,
  };
  console.log(requestSendParams);
  const response = await this.send(requestSendParams);
  console.log(response);
  return response;
};
/** 
 * @this {import('../../../typings').RestN.Request} 
 * @returns {Promise<import('../../../typings').RestN.requestSendReturn>}
 */
async function private(method, path, data, query) {
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
  console.log(requestSendParams);
  const response = await this.send(requestSendParams);
  console.log(response);
  return response;
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
 * @param {import('../../../typings').RestN.restOptions} [restOptions] 
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
   * @type {import('../../../typings').RestN.Rest} 
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
      data.instId = params.symbol;
      data.tdMode = 'cross';
      data.clOrdId = params.id;
      data.side = params.side;
      data.posSide = 'net';
      data.sz = `${params.quantity}`;
      if (params.type === 'market') {
        data.ordType = 'market';
      }
      if (params.type === 'limit') {
        data.ordType = 'post_only';
        data.px = `${params.price}`;
      }
      const response = await request.private('POST', '/api/v5/trade/order', data);
      if (response.data.code !== '0') {
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
      const data = params.map(v => {
        const orderData = {};
        orderData.instId = v.symbol;
        orderData.tdMode = 'cross';
        orderData.clOrdId = v.id;
        orderData.side = v.side;
        orderData.posSide = 'net';
        orderData.sz = `${v.quantity}`;
        if (v.type === 'market') {
          orderData.ordType = 'market';
        }
        if (v.type === 'limit') {
          orderData.ordType = 'post_only';
          orderData.px = `${v.price}`;
        }
        return orderData;
      });
      const response = await request.private('POST', '/api/v5/trade/batch-orders', data);
      if (response.data.code !== '0') {
        return params.map(v => handleResponseError(v, response.data));
      }
      return response.data.data.map((v, i) => {
        if (v.sCode !== '0') {
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
      data.instId = params.symbol;
      data.clOrdId = params.id;
      const response = await request.private('POST', '/api/v5/trade/cancel-order', data);
      if (response.data.code !== '0') {
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
      const data = params.map(v => {
        return { instId: v.symbol, clOrdId: v.id }
      });
      const response = await request.private('POST', '/api/v5/trade/cancel-batch-orders', data);
      if (response.data.code !== '0') {
        return params.map(v => handleResponseError(v, response.data));
      }
      return response.data.data.map((v, i) => {
        if (v.sCode !== '0') {
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
      ordersData.instId = params.symbol;
      const ordersResponse = await request.private('GET', '/api/v5/trade/orders-pending', null, ordersData);
      if (ordersResponse.data.code !== '0') {
        return handleResponseError(params, ordersResponse.data);
      }
      if (!ordersResponse.data.data.length) {
        return { data: params }
      };
      // Cancel open orders
      const cancelData = ordersResponse.data.data.map(v => {
        return { instId: params.symbol, ordId: v.ordId };
      });
      const cancelResponse = await request.private('POST', '/api/v5/trade/cancel-batch-orders', cancelData);
      if (cancelResponse.data.code !== '0') {
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
      data.instId = params.symbol;
      data.cxlOnFail = true;
      data.clOrdId = params.id;
      if (params.price) {
        data.newPx = `${params.price}`;
      }
      if (params.quantity) {
        data.newSz = `${params.quantity}`;
      }
      const response = await request.private('POST', '/api/v5/trade/amend-order', data);
      if (response.data.code !== '0') {
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
      const data = params.map(v => {
        const orderData = {};
        orderData.instId = v.symbol;
        orderData.cxlOnFail = true;
        orderData.clOrdId = v.id;
        if (v.price) {
          orderData.newPx = `${v.price}`;
        }
        if (v.quantity) {
          orderData.newSz = `${v.quantity}`;
        }
        return orderData;
      });
      const response = await request.private('POST', '/api/v5/trade/amend-batch-orders', data);
      if (response.data.code !== '0') {
        return params.map(v => handleResponseError(v, response.data));
      }
      return response.data.data.map((v, i) => {
        if (v.sCode !== '0') {
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
      data.ccy = params.asset;
      const response = await request.private('GET', '/api/v5/account/balance', null, data);
      if (response.data.code !== '0') {
        return handleResponseError(params, response.data);
      }
      const asset = response.data.data[0].details.find(v => v.ccy === params.asset);
      const equity = asset ? +asset.eq : 0;
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
      data.instId = params.symbol;
      data.bar = getCandleResolution(params.interval);
      data.limit = '100';
      data.after = `${moment.utc(params.start).add(params.interval * 100, 'milliseconds').valueOf()}`;
      const response = await request.public('GET', '/api/v5/market/history-candles', data);
      if (response.data.code !== '0') {
        return handleResponseError(params, response.data);
      }
      const candles = response.data.data.reverse().map(v => {
        const candle = {};
        candle.timestamp = moment(+v[0]).utc().format('YYYY-MM-DD HH:mm:ss');
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
      data.instId = params.symbol;
      const response = await request.private('GET', '/api/v5/account/positions', null, data);
      if (response.data.code !== '0') {
        return handleResponseError(params, response.data);
      }
      const positionData = response.data.data.find(v => v.instId === params.symbol);
      const qtyS = positionData && +positionData.pos < 0 ? Math.abs(+positionData.pos) : 0;
      const qtyB = positionData && +positionData.pos > 0 ? Math.abs(+positionData.pos) : 0;
      const pxS = positionData && +positionData.pos < 0 ? +positionData.avgPx : 0;
      const pxB = positionData && +positionData.pos > 0 ? +positionData.avgPx : 0;
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
      data.instId = params.symbol;
      const response = await request.public('GET', '/api/v5/market/ticker', data);
      if (response.data.code !== '0') {
        return handleResponseError(params, response.data);
      }
      const ticker = response.data.data.find(v => v.instId === params.symbol);
      const price = +ticker.last;
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
      markData.instId = params.symbol;
      const markResponse = await request.public('GET', '/api/v5/public/mark-price', markData);
      if (markResponse.data.code !== '0') {
        return handleResponseError(params, markResponse.data);
      }
      // Get position
      const positionData = {};
      positionData.instId = params.symbol;
      const positionResponse = await request.private('GET', '/api/v5/account/positions', null, positionData);
      if (positionResponse.data.code !== '0') {
        return handleResponseError(params, positionResponse.data);
      }
      // Calculate liquidation
      const markResponseData = markResponse.data.data.find(v => v.instId === params.symbol);
      const positionResponseData = positionResponse.data.data.find(v => v.instId === params.symbol);
      const markPx = +markResponseData.markPx;
      const liqPxS = positionResponseData && +positionResponseData.pos < 0 ? +positionResponseData.liqPx : 0;
      const liqPxB = positionResponseData && +positionResponseData.pos > 0 ? +positionResponseData.liqPx : 0;
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
      if (!params.symbol.includes('SWAP')) {
        const fundings = { current: 0, estimated: 0 };
        return { data: fundings };
      }
      const data = {};
      data.instId = params.symbol;
      const response = await request.public('GET', '/api/v5/public/funding-rate', data);
      if (response.data.code !== '0') {
        return handleResponseError(params, response.data);
      }
      const fundingRate = response.data.data.find(v => v.instId === params.symbol);
      const current = fundingRate ? +fundingRate.fundingRate : 0;
      const estimated = fundingRate ? +fundingRate.nextFundingRate : 0;
      const fundings = { current, estimated };
      return { data: fundings };
    },
  };
  return rest;
};
module.exports = Rest;
