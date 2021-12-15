const qs = require('qs');
const uuid = require('uuid').v4;
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
 * @param {RestN.params} params
 * @param {Object | string} responseData 
 * @returns {{ error: RestN.RestErrorResponseData }}
 */
function handleResponseError(params, responseData) {
  /** @type {RestN.restErrorResponseDataType} */
  let type = 'unknown';
  if (responseData.error) {
    if (responseData.error.message === 'too_many_requests') {
      type = 'api-rate-limit';
    }
    if (responseData.error.message === 'not_enough_funds') {
      type = 'insufficient-funds';
    }
    if (responseData.error.message === 'post_only_reject') {
      type = 'post-only-reject';
    }
    if (responseData.error.message === 'order_not_found'
      || responseData.error.message === 'already_closed'
      || responseData.error.message === 'not_open_order') {
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
  if (interval === 86400000) { return '1D' };
  return interval / 60000;
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
 * @this {RestN.Request} 
 * @returns {Promise<RestN.requestSendReturn>}
 */
function public(method, path, data) {
  const dataStringified = data ? `?${qs.stringify(data)}` : '';
  const requestSendParams = {
    url: `${this.restOptions.url}${path}?${dataStringified}`,
    method: method,
  };
  return this.send(requestSendParams);
};
/** 
 * @this {RestN.Request} 
 * @returns {Promise<RestN.requestSendReturn>}
 */
function private(method, path, data) {
  const nonce = uuid();
  const timestamp = Date.now();
  const dataStringified = data ? `?${qs.stringify(data)}` : '';
  const digest = `${timestamp}\n${nonce}\n${method}\n${path}${dataStringified}\n${''}\n`;
  const signature = crypto.createHmac('sha256', this.restOptions.apiSecret).update(digest).digest('hex');
  const authHeaderStr = `deri-hmac-sha256 id=${this.restOptions.apiKey},ts=${timestamp},nonce=${nonce},sig=${signature}`;
  const requestSendParams = {
    url: `${this.restOptions.url}${path}${dataStringified}`,
    method: method,
    headers: { 'Authorization': authHeaderStr },
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
 * @param {RestN.restOptions} [restOptions] 
 */
function Rest(restOptions) {
  // Default restOptions values
  restOptions = restOptions || {};
  restOptions.url = restOptions.url || 'https://www.deribit.com';
  restOptions.apiKey = restOptions.apiKey || '';
  restOptions.apiSecret = restOptions.apiSecret || '';
  restOptions.apiPassphrase = restOptions.apiPassphrase || '';
  restOptions.requestsLimit = restOptions.requestsLimit || 5;
  restOptions.requestsTimestamps = restOptions.requestsTimestamps || 10;
  restOptions.requestsRefill = restOptions.requestsRefill || 0;
  restOptions.requestsRefillType = restOptions.requestsRefillType || '';
  restOptions.requestsRefillInterval = restOptions.requestsRefillInterval || 0;
  // Request creation
  const request = Request({ restOptions, public, private });
  /** 
   * 
   * 
   * @type {RestN.Rest} 
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
      data.instrument_name = params.symbol;
      data.amount = params.quantity;
      data.label = params.id;
      if (params.type === 'limit') {
        data.type = params.type;
        data.price = params.price;
        data.post_only = true;
        data.reject_post_only = true;
      }
      if (params.type === 'market') {
        data.type = params.type;
        data.time_in_force = 'good_til_cancelled';
      }
      const response = await request.private('GET', `/api/v2/private/${params.side}`, data);
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
    createOrders: (params) => Promise.all(params.map(v => rest.createOrder(v))),
    /**
     * 
     * 
     * CANCEL ORDER
     * 
     * 
     */
    cancelOrder: async (params) => {
      const data = {};
      data.label = params.id;
      const response = await request.private('GET', '/api/v2/private/cancel_by_label', data);
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
    cancelOrders: (params) => Promise.all(params.map(v => rest.cancelOrder(v))),
    /**
     * 
     * 
     * CANCEL ORDERS ALL
     * 
     * 
     */
    cancelOrdersAll: async (params) => {
      const data = {};
      data.instrument_name = params.symbol;
      const response = await request.private('GET', '/api/v2/private/cancel_all_by_instrument', data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data);
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
      data.label = params.id;
      data.instrument_name = params.symbol;
      if (params.price) {
        data.price = params.price;
      }
      if (params.quantity) {
        data.amount = params.quantity;
      }
      const response = await request.private('GET', '/api/v2/private/edit_by_label', data);
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
    updateOrders: (params) => Promise.all(params.map(v => rest.updateOrder(v))),
    /**
     * 
     * 
     * GET EQUITY
     * 
     * 
     */
    getEquity: async (params) => {
      const data = {};
      data.extended = true;
      data.currency = params.asset;
      const response = await request.private('GET', '/api/v2/private/get_account_summary', data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data);
      }
      const equity = +response.data.result.equity;
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
      data.instrument_name = params.symbol;
      data.start_timestamp = moment.utc(params.start).valueOf();
      data.end_timestamp = moment.utc(params.start).add(86400000, 'milliseconds').valueOf();
      data.resolution = getCandleResolution(params.interval);
      const response = await request.public('GET', '/api/v2/public/get_tradingview_chart_data', data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data);
      }
      const candlesResult = response.data.result;
      const candles = candlesResult.ticks.map((v, i) => {
        const candle = {};
        candle.timestamp = moment.unix(candlesResult.ticks[i]).utc().format('YYYY-MM-DD HH:mm:ss');
        candle.open = +candlesResult.open[i];
        candle.high = +candlesResult.high[i];
        candle.low = +candlesResult.low[i];
        candle.close = +candlesResult.close[i];
        candle.volume = +candlesResult.volume[i];
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
      data.instrument_name = params.symbol;
      const response = await request.private('GET', '/api/v2/private/get_position', data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data);
      }
      const positionResult = response.data.result;
      const qtyS = positionResult.direction === 'sell' ? Math.abs(+positionResult.size) : 0;
      const qtyB = positionResult.direction === 'buy' ? Math.abs(+positionResult.size) : 0;
      const pxS = positionResult.direction === 'sell' ? +positionResult.average_price : 0;
      const pxB = positionResult.direction === 'buy' ? +positionResult.average_price : 0;
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
      data.instrument_name = params.symbol;
      const response = await request.public('GET', '/api/v2/public/ticker', data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data);
      }
      const price = +response.data.result.last_price;
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
      const data = {};
      data.instrument_name = params.symbol;
      const response = await request.private('GET', '/api/v2/private/get_position', data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data);
      }
      const positionResult = response.data.result;
      const markPx = +positionResult.mark_price;
      const liqPxS = positionResult.direction === 'sell' ? +positionResult.estimated_liquidation_price : 0;
      const liqPxB = positionResult.direction === 'buy' ? +positionResult.estimated_liquidation_price : 0;
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
      const data = {};
      data.instrument_name = params.symbol;
      const response = await request.public('GET', '/api/v2/public/ticker', data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data);
      }
      const current = +response.data.result.current_funding;
      const estimated = +response.data.result.current_funding;
      const fundings = { current, estimated, };
      return { data: fundings };
    },
  };
  return rest;
};
module.exports = Rest;
