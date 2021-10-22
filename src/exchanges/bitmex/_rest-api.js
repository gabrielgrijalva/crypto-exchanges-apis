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
 * @param {RestApi.params} params
 * @param {Object | string} responseData 
 * @returns {RestApi.RestErrorResponse}
 */
function handleResponseError(params, responseData) {
  /** @type {RestApi.restErrorResponseDataType} */
  let type = 'unknown';
  if (responseData.error) {
    if (responseData.error.message === 'Not Found'
      || responseData.error.message === 'Invalid ordStatus'
      || responseData.error.message === 'Invalid origClOrdID'
      || responseData.error.message === 'Invalid amend: orderQty, leavesQty, price, stopPx unchanged'
      || responseData.error.message === 'Unable to cancel order'
      || responseData.error.message === 'Unable to cancel order due to existing state: Filled'
      || responseData.error.message === 'Unable to cancel order due to existing state: Canceled'
      || responseData.error.message === 'Unable to cancel order: Not found or not owned by user') {
      type = 'order-not-found';
    }
    if (responseData.error.message === 'Rate limit exceeded, retry in 1 seconds.') {
      type = 'api-rate-limit';
    }
    if (responseData.error.message === 'The system is currently overloaded. Please try again later.') {
      type = 'request-not-accepted';
    }
    if (responseData.error.message.includes('Account has insufficient Available Balance')) {
      type = 'insufficient-funds';
    }
  }
  if (responseData.code === 'ETIMEDOUT' || responseData.code === 'ESOCKETTIMEDOUT') {
    type = 'request-timeout';
  }
  return {
    error: true,
    data: {
      type: type,
      params: params,
      exchange: responseData,
    }
  }
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
function private(method, path, data) {
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
  return this.send(requestSendParams);
}
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
      return { error: false, data: params };
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
      data.orders = params.map(v => {
        const orderData = {};
        orderData.side = v.side === 'sell' ? 'Sell' : 'Buy';
        orderData.symbol = v.symbol;
        orderData.clOrdID = v.id;
        orderData.ordType = v.type === 'limit' ? 'Limit' : 'Market';
        orderData.orderQty = v.quantity;
        if (v.type === 'limit') {
          orderData.price = v.price;
          orderData.execInst = 'ParticipateDoNotInitiate';
        }
        return orderData;
      });
      const response = await request.private('POST', '/api/v1/order/bulk', data);
      if (response.status >= 400) {
        return params.map(v => handleResponseError(v, response.data));
      }
      return response.data.map((v, i) => {
        if (v.error) {
          return handleResponseError(params[i], v);
        }
        return { error: false, data: params[i] };
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
      data.clOrdID = [params.id];
      const response = await request.private('DELETE', '/api/v1/order', data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data);
      }
      return { error: false, data: params };
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
        return { error: false, data: params[i] };
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
      return { error: false, data: params };
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
      const response = await request.private('PUT', '/api/v1/order', params);
      if (response.status >= 400) {
        return handleResponseError(params, response.data);
      }
      return { error: false, data: params };
    },
    /**
     * 
     * 
     * UPDATE ORDER
     * 
     * 
     */
    updateOrders: async (params) => {
      const data = {};
      data.orders = params.map(v => {
        const orderData = {};
        orderData.origClOrdID = v.id;
        if (v.price) {
          orderData.price = v.price;
        }
        if (v.quantity) {
          orderData.orderQty = v.quantity;
        }
        return orderData;
      });
      const response = await request.private('PUT', '/api/v1/order/bulk', data);
      if (response.status >= 400) {
        return params.map(v => handleResponseError(v, response.data));
      }
      return response.data.map((v, i) => {
        if (v.error) {
          return handleResponseError(params[i], v);
        }
        return { error: false, data: params[i] };
      });
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
      data.to = moment.utc(params.finish).unix();
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
      return { error: false, data: candles };
    },
    /**
     * 
     * 
     * GET POSITION
     * 
     * 
     */
    getPosition: async (params) => {
      // Get trade
      const tradeData = {};
      tradeData.symbol = params.symbol;
      tradeData.reverse = true;
      const tradeResponse = await request.private('GET', '/api/v1/trade', tradeData);
      if (tradeResponse.status >= 400) {
        return handleResponseError(params, tradeResponse.data);
      }
      // Get position 
      const positionData = {};
      positionData.filter = { symbol: params.symbol };
      const positionResponse = await request.private('GET', '/api/v1/position', positionData);
      if (positionResponse.status >= 400) {
        return handleResponseError(params, positionResponse.data);
      }
      // Get margin
      const marginData = {};
      marginData.currency = 'XBt';
      const marginResponse = await request.private('GET', '/api/v1/user/margin', marginData);
      if (marginResponse.status >= 400) {
        return handleResponseError(params, marginResponse.data);
      }
      // Calculate positions
      const positions = {};
      positions.qtyS = Math.abs(positionResponse.data[0] && +positionResponse.data[0].currentQty < 0 ? +positionResponse.data[0].currentQty : 0);
      positions.qtyB = Math.abs(positionResponse.data[0] && +positionResponse.data[0].currentQty > 0 ? +positionResponse.data[0].currentQty : 0);
      positions.pxS = positions.qtyS ? +positionResponse.data[0].avgEntryPrice : 0;
      positions.pxB = positions.qtyB ? +positionResponse.data[0].avgEntryPrice : 0;
      // Calculate positions pnl
      const positionsPnl = {};
      const contVal = params.contractValue;
      positionsPnl.pnlS = round.normal((positions.pxS && positions.qtyS
        ? (contVal / tradeResponse.data[0].price - contVal / positions.pxS) : 0) * positions.qtyS, 8);
      positionsPnl.pnlB = round.normal((positions.pxB && positions.qtyB
        ? (contVal / positions.pxB - contVal / tradeResponse.data[0].price) : 0) * positions.qtyB, 8);
      // Calculate balance and equity
      const balances = {};
      const marginBalance = marginResponse.data.marginBalance / 100000000;
      const initialBalance = marginBalance - positionsPnl.pnlS - positionsPnl.pnlB;
      const isolatedMarginS = positions.qtyS ? (positions.qtyS / positions.pxS) / params.leverage : 0;
      const isolatedMarginB = positions.qtyB ? (positions.qtyB / positions.pxB) / params.leverage : 0;
      const balance = initialBalance - isolatedMarginS - isolatedMarginB
      balances.equity = marginBalance;
      balances.balance = balance;
      // Return information
      const data = {
        pxS: positions.pxS,
        pxB: positions.pxB,
        qtyS: positions.qtyS,
        qtyB: positions.qtyB,
        pnlS: positionsPnl.pnlS,
        pnlB: positionsPnl.pnlB,
        equity: balances.equity,
        balance: balances.balance,
      };
      return { error: false, data: data };
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
      return { error: false, data: price };
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
      const liquidation = {
        markPx: markPx,
        liqPxS: liqPxS,
        liqPxB: liqPxB,
      };
      return { error: false, data: liquidation };
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
      return { error: false, data: fundings };
    },
  };
  return rest;
};
module.exports = Rest;
