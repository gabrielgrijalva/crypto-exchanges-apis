const Flatted = require('flatted');
const qs = require('qs');
const crypto = require('crypto');
const moment = require('moment');
const round = require('../../_utils/round');
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
 * @param {string} callingFunction
 * @returns {{ error: import('../../../typings/_rest').RestErrorResponseData<any> }}
 */
function handleResponseError(params, responseData, callingFunction) {
  /** @type {import('../../../typings/_rest').restErrorResponseDataType} */
  let type = 'unknown';
  if (responseData.error) {
    const errorMessage = responseData.error.message || responseData.error;
    if (errorMessage === 'Request timeout') {
      type = 'request-timeout';
    }
    if (errorMessage.includes('Not Found')
      || errorMessage.includes('Invalid ordStatus')
      || errorMessage.includes('Invalid origClOrdID')
      || errorMessage.includes('Invalid amend: orderQty, leavesQty, price, stopPx unchanged')
      || errorMessage.includes('Unable to cancel order')
      || errorMessage.includes('Unable to cancel order due to existing state: Filled')
      || errorMessage.includes('Unable to cancel order due to existing state: Canceled')
      || errorMessage.includes('Unable to cancel order: Not found or not owned by user')) {
      type = 'order-not-found';
    }
    if (errorMessage.includes('Rate limit exceeded, retry in 1 seconds.')) {
      type = 'api-rate-limit';
    }
    if (errorMessage.includes('The system is currently overloaded. Please try again later.')) {
      type = 'request-not-accepted';
    }
    if (errorMessage.includes('Account has insufficient Available Balance')) {
      type = 'insufficient-funds';
    }
  }
  if (responseData.code === 'ETIMEDOUT' || responseData.code === 'ESOCKETTIMEDOUT') {
    type = 'request-timeout';
  }
  return {
    error: {
      callingFunction,
      type: type,
      params: Flatted.stringify(params),
      exchange: Flatted.stringify(responseData),
    }
  }
};
/**
 * @param {number} interval 
 * @returns {string}
 */
function getCandleResolution(interval) {
  if (interval === 60000) { return '1' };
  if (interval === 300000) { return '5' };
  if (interval === 3600000) { return '60' };
  if (interval === 86400000) { return '1d' };
};
/**
 * 
 */
function hrtimeToMilliseconds(hrtime) {
  return (hrtime[0] * 1000) + (hrtime[1] / 1e6);
}
/**
 * 
 * @param {string} asset
 */
function getEquityDivisor(asset) {
  if (asset === 'XBt') { return 100000000 };
  if (asset === 'USDt') { return 1000000 };
  throw new Error('Could not get divisor for asset');
};
/**
 * 
 * @param {Object} res
 * @param {Object} req
 */
async function setRateLimit(res, req) {
  if (res.headers && res.headers['x-ratelimit-remaining']) {
    const globalRateLimit = Number(res.headers['x-ratelimit-remaining'])
    await req.updateRequestLimit(globalRateLimit)
    if (res.headers['x-ratelimit-remaining-1s']) {
      const oneSecondRateLimit = Number(res.headers['x-ratelimit-remaining-1s'])
      const lowestLimit = oneSecondRateLimit < globalRateLimit ? oneSecondRateLimit : globalRateLimit;
      console.log('Global Rate Limit', globalRateLimit)
      console.log('1s Rate Limit', oneSecondRateLimit)
      await req.updateRequestLimit(lowestLimit)
    }
  }
}
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
 * @param {import('../../../typings/_rest').restSettings} restSettings
 */
function getPrivateFunction(restSettings) {
  /** 
   * @this {import('../../../typings/_rest').Request} 
   * @returns {Promise<import('../../../typings/_rest').requestSendReturn>}
   */
  async function private(method, path, data, requestConsumption = 1) {
    const headers = {};
    const dataStringified = qs.stringify(data);
    if (restSettings.API_KEY && restSettings.API_SECRET) {
      const expires = Math.floor(Date.now() / 1000 + 60).toString();
      const digest = `${method}${path}?${dataStringified}${expires}`;
      const signature = crypto.createHmac('sha256', restSettings.API_SECRET).update(digest).digest('hex');
      headers['api-expires'] = expires;
      headers['api-key'] = restSettings.API_KEY;
      headers['api-signature'] = signature;
    }
    const requestSendParams = {
      url: `${restSettings.URL}${path}?${dataStringified}`,
      method: method,
      headers: headers,
      requestConsumption
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
 * @param {import('../../../typings/_rest').restSettings} restSettings
 */
function Rest(restSettings = {}) {
  // Default rest restSettings values
  restSettings.URL = restSettings.URL || 'https://www.bitmex.com';
  restSettings.REQUESTS_REFILL = restSettings.REQUESTS_REFILL || false;
  restSettings.REQUESTS_REFILL_LIMIT = restSettings.REQUESTS_REFILL_LIMIT || 120;
  restSettings.REQUESTS_REFILL_AMOUNT = restSettings.REQUESTS_REFILL_AMOUNT || 2;
  restSettings.REQUESTS_REFILL_INTERVAL = restSettings.REQUESTS_REFILL_INTERVAL || 1000;
  restSettings.REQUESTS_TIMESTAMPS = restSettings.REQUESTS_TIMESTAMPS || 10;
  // Request creation
  const REST_SETTINGS = restSettings;
  const PRIVATE = getPrivateFunction(restSettings);
  const request = Request({ REST_SETTINGS, PRIVATE });
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
      data.side = params.side === 'sell' ? 'Sell' : 'Buy';
      data.symbol = params.symbol;
      data.clOrdID = params.id;
      data.orderQty = params.quantity;
      if (params.type === 'limit') {
        data.price = params.price;
        data.ordType = 'Limit';
      }
      if (params.type === 'market') {
        data.ordType = 'Market';
      }
      if (params.type === 'post-only') {
        data.price = params.price;
        data.ordType = 'Limit';
        data.execInst = 'ParticipateDoNotInitiate';
      }
      if (params.type === 'immidiate-or-cancel') {
        data.price = params.price;
        data.ordType = 'Limit';
        data.timeInForce = 'ImmediateOrCancel';
      }
      let start = process.hrtime();
      const response = await request.private('POST', '/api/v1/order', data);
      let end = process.hrtime(start);
      console.log(`Create orderId: ${data.clOrdID}, RTT: ${hrtimeToMilliseconds(end)} ms`)
      if (response.status >= 400) {
        return handleResponseError(params, response.data, 'createOrder');
      }
      setRateLimit(response, request);
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
      data.clOrdID = [params.id];
      let start = process.hrtime();
      const response = await request.private('DELETE', '/api/v1/order', data);
      let end = process.hrtime(start);
      console.log(`Cancel orderId: ${data.clOrdID}, RTT: ${hrtimeToMilliseconds(end)} ms`)
      if (response.status >= 400) {
        return handleResponseError(params, response.data, 'cancelOrder');
      }
      setRateLimit(response, request);
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
      data.clOrdID = params.map(v => v.id);
      let start = process.hrtime();
      const response = await request.private('DELETE', '/api/v1/order', data);
      let end = process.hrtime(start);
      console.log(`Cancel orderId: ${data.clOrdID}, RTT: ${hrtimeToMilliseconds(end)} ms`)
      if (response.status >= 400) {
        return params.map(v => handleResponseError(v, response.data, 'cancelOrders 1'));
      }
      setRateLimit(response, request);
      return response.data.map((v, i) => {
        if (v.error) {
          return handleResponseError(params[i], v, 'cancelOrders 2');
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
      const data = {};
      data.symbol = params.symbol;
      let start = process.hrtime();
      const response = await request.private('DELETE', '/api/v1/order/all', data);
      let end = process.hrtime(start);
      console.log(`Cancel orders all, RTT: ${hrtimeToMilliseconds(end)} ms`)
      if (response.status >= 400) {
        return handleResponseError(params, response.data, 'cancelOrdersAll');
      }
      setRateLimit(response, request);
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
      data.origClOrdID = params.id;
      if (params.price) {
        data.price = params.price;
      }
      if (params.quantity) {
        data.orderQty = params.quantity;
      }
      let start = process.hrtime();
      const response = await request.private('PUT', '/api/v1/order', data);
      let end = process.hrtime(start);
      console.log(`Update orderId: ${data.origClOrdID}, RTT: ${hrtimeToMilliseconds(end)} ms`)
      if (response.status >= 400) {
        return handleResponseError(params, response.data, 'updateOrder');
      }
      setRateLimit(response, request);
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
     * GET EQUITT
     * 
     * 
     */
    getEquity: async (params) => {
      const data = {};
      data.currency = params.asset;
      const response = await request.private('GET', '/api/v1/user/margin', data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data, 'getEquity');
      }
      setRateLimit(response, request);
      const divisor = getEquityDivisor(params.asset);
      const equity = round.normal(response.data.marginBalance / divisor, 8);
      return { data: equity };
    },
    /**
     * 
     * 
     * GET EQUITY AND PNL
     * 
     * 
     */
    getEquityAndPnl: null,
    /**
     * 
     * 
     * GET CANDLES
     * 
     * 
     */
    getCandles: async (params) => {
      const data = {};
      data.to = moment.utc(params.start).add(params.interval * 10080, 'milliseconds').unix();
      data.from = moment.utc(params.start).add(params.interval, 'milliseconds').unix();
      data.symbol = params.symbol;
      data.resolution = getCandleResolution(params.interval);
      const response = await request.private('GET', '/api/udf/history', data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data, 'getCandles');
      }
      setRateLimit(response, request);
      const candles = response.data.t.map((v, i, a) => {
        const candle = {};
        candle.timestamp = moment.unix(response.data.t[i]).utc().format('YYYY-MM-DD HH:mm:ss');
        candle.open = +response.data.o[i];
        candle.high = +response.data.h[i];
        candle.low = +response.data.l[i];
        candle.close = +response.data.c[i];
        candle.volume = +response.data.v[i];
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
      data.filter = { symbol: params.symbol };
      const response = await request.private('GET', '/api/v1/position', data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data, 'getPosition');
      }
      setRateLimit(response, request);
      const qtyS = Math.abs(response.data[0] && +response.data[0].currentQty < 0 ? +response.data[0].currentQty : 0);
      const qtyB = Math.abs(response.data[0] && +response.data[0].currentQty > 0 ? +response.data[0].currentQty : 0);
      const pxS = qtyS ? +response.data[0].avgCostPrice : 0;
      const pxB = qtyB ? +response.data[0].avgCostPrice : 0;
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
      data.symbol = params.symbol;
      data.reverse = true;
      const response = await request.private('GET', '/api/v1/trade', data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data, 'getLastPrice');
      }
      setRateLimit(response, request);
      const price = +response.data[0].price;
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
      // Get position 
      const positionData = {};
      positionData.filter = { symbol: params.symbol };
      const positionResponse = await request.private('GET', '/api/v1/position', positionData);
      if (positionResponse.status >= 400) {
        return handleResponseError(params, positionResponse.data, 'getLiquidation 1');
      }
      setRateLimit(positionResponse, request);
      // Get instrument
      const instrumentData = {};
      instrumentData.symbol = params.symbol;
      const instrumentResponse = await request.private('GET', '/api/v1/instrument', instrumentData);
      if (instrumentResponse.status >= 400) {
        return handleResponseError(params, instrumentResponse.data, 'getLiquidation 2');
      }
      setRateLimit(instrumentResponse, request);
      // Calculate liquidation
      const markPx = +instrumentResponse.data[0].markPrice;
      const liqPxS = positionResponse.data[0] && +positionResponse.data[0].currentQty < 0 ? +positionResponse.data[0].liquidationPrice : 0;
      const liqPxB = positionResponse.data[0] && +positionResponse.data[0].currentQty > 0 ? +positionResponse.data[0].liquidationPrice : 0;
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
      data.symbol = params.symbol;
      const response = await request.private('GET', '/api/v1/instrument', data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data, 'getFundingRates');
      }
      setRateLimit(response, request);
      const fundings = {
        current: +response.data[0].fundingRate,
        estimated: +response.data[0].indicativeFundingRate,
      };
      return { data: fundings };
    },
    /**
     * 
     * 
     * GET MARK PRICES OPTION
     * 
     * 
     */
    getMarkPricesOption: null,
    /**
     * 
     * 
     * GET INSTRUMENT SYMBOLS
     * 
     * 
     */
    getInstrumentsSymbols: async () => {
      const data = {};
      const response = await request.private('GET', '/api/v1/instrument', data);
      if (response.status >= 400) {
        return handleResponseError(null, response.data, 'getInstrumentsSymbols');
      }
      setRateLimit(response, request);
      const symbols = response.data.map(v => v.symbol);
      return { data: symbols };
    },
  };
  return rest;
};
module.exports = Rest;
