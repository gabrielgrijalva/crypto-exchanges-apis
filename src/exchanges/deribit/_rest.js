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
 * @param {import('../../../typings/_rest').params} params
 * @param {Object | string} responseData 
 * @returns {{ error: import('../../../typings/_rest').RestErrorResponseData }}
 */
function handleResponseError(params, responseData) {
  /** @type {import('../../../typings/_rest').restErrorResponseDataType} */
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
  return (interval / 60000).toString();
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
 * @param {import('../../../typings/settings')} settings 
 */
function getPublicFunction(settings) {
  /** 
   * @this {import('../../../typings/_rest').Request} 
   * @returns {Promise<import('../../../typings/_rest').requestSendReturn>}
   */
  async function public(method, path, data) {
    const dataStringified = data ? `?${qs.stringify(data)}` : '';
    const requestSendParams = {
      url: `${settings.REST.URL}${path}${dataStringified}`,
      method: method,
    };
    const response = await this.send(requestSendParams);
    return response;
  };
  return public;
};
/**
 * @param {import('../../../typings/settings')} settings 
 */
function getPrivateFunction(settings) {
  /** 
   * @this {import('../../../typings/_rest').Request} 
   * @returns {Promise<import('../../../typings/_rest').requestSendReturn>}
   */
  async function private(method, path, data) {
    const nonce = uuid();
    const timestamp = Date.now();
    const dataStringified = data ? `?${qs.stringify(data)}` : '';
    const digest = `${timestamp}\n${nonce}\n${method}\n${path}${dataStringified}\n${''}\n`;
    const signature = crypto.createHmac('sha256', settings.API_SECRET).update(digest).digest('hex');
    const authHeaderStr = `deri-hmac-sha256 id=${settings.API_KEY},ts=${timestamp},nonce=${nonce},sig=${signature}`;
    const requestSendParams = {
      url: `${settings.REST.URL}${path}${dataStringified}`,
      method: method,
      headers: { 'Authorization': authHeaderStr },
    };
    const response = await this.send(requestSendParams);
    return response;
  };
  return private;
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
 * @param {import('../../../typings/settings')} settings
 */
function Rest(settings) {
  // Default rest settings values
  settings.REST.URL = settings.REST.URL || 'https://www.deribit.com';
  settings.REST.REQUESTS_LIMIT = settings.REST.REQUESTS_LIMIT || 5;
  settings.REST.REQUESTS_REFILL = settings.REST.REQUESTS_REFILL || 5;
  settings.REST.REQUESTS_REFILL_INTERVAL = settings.REST.REQUESTS_REFILL_INTERVAL || 1000;
  settings.REST.REQUESTS_TIMESTAMPS = settings.REST.REQUESTS_TIMESTAMPS || 10;
  // Request creation
  const public = getPublicFunction(settings);
  const private = getPrivateFunction(settings);
  const request = Request({ settings, public, private });
  /** 
   * 
   * 
   * @type {import('../../../typings/_rest').Rest} 
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
      data.instrument_name = settings.SYMBOL;
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
    cancelOrdersAll: async () => {
      const data = {};
      data.instrument_name = settings.SYMBOL;
      const response = await request.private('GET', '/api/v2/private/cancel_all_by_instrument', data);
      if (response.status >= 400) {
        return handleResponseError({}, response.data);
      }
      return { data: {} };
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
      data.instrument_name = settings.SYMBOL;
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
    getEquity: async () => {
      const data = {};
      data.extended = true;
      data.currency = settings.ASSET;
      const response = await request.private('GET', '/api/v2/private/get_account_summary', data);
      if (response.status >= 400) {
        return handleResponseError({}, response.data);
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
      data.instrument_name = settings.SYMBOL;
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
        candle.timestamp = moment(candlesResult.ticks[i]).utc().format('YYYY-MM-DD HH:mm:ss');
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
    getPosition: async () => {
      const data = {};
      data.instrument_name = settings.SYMBOL;
      const response = await request.private('GET', '/api/v2/private/get_position', data);
      if (response.status >= 400) {
        return handleResponseError({}, response.data);
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
    getLastPrice: async () => {
      const data = {};
      data.instrument_name = settings.SYMBOL;
      const response = await request.public('GET', '/api/v2/public/ticker', data);
      if (response.status >= 400) {
        return handleResponseError({}, response.data);
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
      data.instrument_name = settings.SYMBOL;
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
    getFundingRates: async () => {
      const data = {};
      data.instrument_name = settings.SYMBOL;
      const response = await request.public('GET', '/api/v2/public/ticker', data);
      if (response.status >= 400) {
        return handleResponseError({}, response.data);
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
