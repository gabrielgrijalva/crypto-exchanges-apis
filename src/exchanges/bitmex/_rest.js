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
 * @param {import('../../../typings').RestN.params} params
 * @param {Object | string} responseData 
 * @returns {{ error: import('../../../typings').RestN.RestErrorResponseData }}
 */
function handleResponseError(params, responseData) {
  /** @type {import('../../../typings').RestN.restErrorResponseDataType} */
  let type = 'unknown';
  if (responseData.error) {
    const errorMessage = responseData.error.message || responseData.error;
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
      type: type,
      params: params,
      exchange: responseData,
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
async function private(method, path, data) {
  const headers = {};
  const dataStringified = qs.stringify(data);
  if (this.restOptions.apiKey && this.restOptions.apiSecret) {
    const expires = Math.floor(Date.now() / 1000 + 60).toString();
    const digest = `${method}${path}?${dataStringified}${expires}`;
    const signature = crypto.createHmac('sha256', this.restOptions.apiSecret).update(digest).digest('hex');
    headers['api-expires'] = expires;
    headers['api-key'] = this.restOptions.apiKey;
    headers['api-signature'] = signature;
  }
  const requestSendParams = {
    url: `${this.restOptions.url}${path}?${dataStringified}`,
    method: method,
    headers: headers,
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
  restOptions.url = restOptions.url || 'https://www.bitmex.com';
  restOptions.apiKey = restOptions.apiKey || '';
  restOptions.apiSecret = restOptions.apiSecret || '';
  restOptions.apiPassphrase = restOptions.apiPassphrase || '';
  restOptions.requestsLimit = restOptions.requestsLimit || 60;
  restOptions.requestsTimestamps = restOptions.requestsTimestamps || 10;
  restOptions.requestsRefill = restOptions.requestsRefill || 0;
  restOptions.requestsRefillType = restOptions.requestsRefillType || '';
  restOptions.requestsRefillInterval = restOptions.requestsRefillInterval || 0;
  // Request creation
  const request = Request({ restOptions, private });
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
      data.side = params.side === 'sell' ? 'Sell' : 'Buy';
      data.symbol = params.symbol;
      data.clOrdID = params.id;
      data.ordType = params.type === 'limit' ? 'Limit' : 'Market';
      data.orderQty = params.quantity;
      if (params.type === 'limit') {
        data.price = params.price;
        data.execInst = 'ParticipateDoNotInitiate';
      }
      const response = await request.private('POST', '/api/v1/order', data);
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
      data.clOrdID = [params.id];
      const response = await request.private('DELETE', '/api/v1/order', data);
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
      data.clOrdID = params.map(v => v.id);
      const response = await request.private('DELETE', '/api/v1/order', data);
      if (response.status >= 400) {
        return params.map(v => handleResponseError(v, response.data));
      }
      return response.data.map((v, i) => {
        if (v.error) {
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
      const data = {};
      data.symbol = params.symbol;
      const response = await request.private('DELETE', '/api/v1/order/all', data);
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
      data.origClOrdID = params.id;
      if (params.price) {
        data.price = params.price;
      }
      if (params.quantity) {
        data.orderQty = params.quantity;
      }
      const response = await request.private('PUT', '/api/v1/order', data);
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
     * GET EQUITT
     * 
     * 
     */
    getEquity: async (params) => {
      const data = {};
      data.currency = params.asset;
      const response = await request.private('GET', '/api/v1/user/margin', data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data);
      }
      const equity = round.normal(response.data.marginBalance / 100000000, 8);
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
      data.to = moment.utc(params.start).add(params.interval * 10080, 'milliseconds').unix();
      data.from = moment.utc(params.start).add(params.interval, 'milliseconds').unix();
      data.symbol = params.symbol;
      data.resolution = getCandleResolution(params.interval);
      const response = await request.private('GET', '/api/udf/history', data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data);
      }
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
        return handleResponseError(params, response.data);
      }
      const qtyS = Math.abs(response.data[0] && +response.data[0].currentQty < 0 ? +response.data[0].currentQty : 0);
      const qtyB = Math.abs(response.data[0] && +response.data[0].currentQty > 0 ? +response.data[0].currentQty : 0);
      const pxS = qtyS ? +response.data[0].avgEntryPrice : 0;
      const pxB = qtyB ? +response.data[0].avgEntryPrice : 0;
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
        return handleResponseError(params, response.data);
      }
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
        return handleResponseError(params, positionResponse.data);
      }
      // Get instrument
      const instrumentData = {};
      instrumentData.symbol = params.symbol;
      const instrumentResponse = await request.private('GET', '/api/v1/instrument', instrumentData);
      if (instrumentResponse.status >= 400) {
        return handleResponseError(params, instrumentResponse.data);
      }
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
        return handleResponseError(params, response.data);
      }
      const fundings = {
        current: +response.data[0].fundingRate,
        estimated: +response.data[0].indicativeFundingRate,
      };
      return { data: fundings };
    },
  };
  return rest;
};
module.exports = Rest;
