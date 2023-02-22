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
 * @param {import('../../../typings/_rest').params} params
 * @param {Object | string} responseData 
 * @returns {{ error: import('../../../typings/_rest').RestErrorResponseData<any> }}
 */
function handleResponseError(params, responseData) {
  /** @type {import('../../../typings/_rest').restErrorResponseDataType} */
  let type = 'unknown';
  if (responseData.label) {
    const label = responseData.label;
    if (label === 'ORDER_NOT_FOUND' || label === 'ORDER_CLOSED' || label === 'ORDER_CANCELLED'
      || label === 'ORDER_FINISHED' || label === 'POSITION_EMPTY') {
      type = 'order-not-found';
    }
    if (label === 'POC_FILL_IMMEDIATELY' || label === 'ORDER_POC_IMMEDIATE') {
      type = 'post-only-reject';
    }
    if (label === 'POSITION_IN_CLOSE') {
      type = 'request-not-accepted';
    }
    if (label === 'BALANCE_NOT_ENOUGH' || label === 'MARGIN_BALANCE_NOT_ENOUGH' || label === 'INSUFFICIENT_AVAILABLE') {
      type = 'insufficient-funds';
    }
  }
  return {
    error: {
      type: type,
      params: JSON.stringify(params),
      exchange: JSON.stringify(responseData),
    }
  }
};
/**
 * @param {number} interval 
 * @returns {string | number}
 */
function getCandleResolution(interval) {
  if (interval === 60000) { return '1m' };
  if (interval === 300000) { return '5m' };
  if (interval === 900000) { return '15m' };
  if (interval === 1800000) { return '30m' };
  if (interval === 3600000) { return '1h' };
  if (interval === 14400000) { return '4h' };
  if (interval === 28800000) { return '8h' };
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
 * @param {import('../../../typings/_rest').restSettings} restSettings 
 */
function getPublicFunction(restSettings) {
  /** 
   * @this {import('../../../typings/_rest').Request} 
   * @returns {Promise<import('../../../typings/_rest').requestSendReturn>}
   */
  async function public(method, path, data) {
    const dataStringified = qs.stringify(data);
    const requestSendParams = {
      url: `${restSettings.URL}${path}?${dataStringified}`,
      method: method,
    };
    const response = await this.send(requestSendParams);
    return response;
  };
  return public;
};
/**
 * @param {import('../../../typings/_rest').restSettings} restSettings 
 */
function getPrivateFunction(restSettings) {
  /** 
   * @this {import('../../../typings/_rest').Request} 
   * @returns {Promise<import('../../../typings/_rest').requestSendReturn>}
   */
  async function private(method, path, data) {
    const timestamp = `${moment.utc().unix()}`;
    const dataString = method === 'POST' ? JSON.stringify(data) : '';
    const queryString = method === 'GET' ? qs.stringify(data) : '';
    const digest = `${method}\n${path}\n${queryString}\n${crypto.createHash('sha512').update(dataString).digest('hex')}\n${timestamp}`;
    const signature = crypto.createHmac('sha512', restSettings.API_SECRET).update(digest).digest('hex');
    const requestSendParams = {
      url: `${restSettings.URL}${path}?${queryString}`,
      method: method,
      headers: {
        'KEY': restSettings.API_KEY,
        'SIGN': signature,
        'Timestamp': timestamp,
      },
      data: dataString,
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

  const settle = restSettings.ASSET ? restSettings.ASSET.toLowerCase() : 'usdt';
  
  restSettings.URL = restSettings.URL || 'https://api.gateio.ws';
  restSettings.REQUESTS_REFILL = restSettings.REQUESTS_REFILL || false;
  restSettings.REQUESTS_REFILL_LIMIT = restSettings.REQUESTS_REFILL_LIMIT || 200;
  restSettings.REQUESTS_REFILL_AMOUNT = restSettings.REQUESTS_REFILL_AMOUNT || 200;
  restSettings.REQUESTS_REFILL_INTERVAL = restSettings.REQUESTS_REFILL_INTERVAL || 1000;
  restSettings.REQUESTS_TIMESTAMPS = restSettings.REQUESTS_TIMESTAMPS || 10;
  // Request creation
  const REST_SETTINGS = restSettings;
  const PUBLIC = getPublicFunction(restSettings);
  const PRIVATE = getPrivateFunction(restSettings);
  const request = Request({ REST_SETTINGS, PUBLIC, PRIVATE });
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
      data.text = params.id;
      data.size = params.quantity * (params.side === 'sell' ? -1 : +1);
      data.contract = params.symbol;
      if (params.type === 'limit') {
        data.tif = 'gtc';
        data.price = `${params.price}`;
      }
      if (params.type === 'market') {
        data.tif = 'ioc';
        data.price = '0';
      }
      if (params.type === 'post-only') {
        data.tif = 'poc';
        data.price = `${params.price}`;
      }
      if (params.type === 'immidiate-or-cancel') {
        data.tif = 'ioc';
        data.price = `${params.price}`;
      }
      const response = await request.private('POST', `/api/v4/futures/${settle}/orders`, data);
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
      const response = await request.private('DELETE', `/api/v4/futures/${settle}/orders/${params.id}`, data);
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
      data.contract = params.symbol;
      const response = await request.private('DELETE', `/api/v4/futures/${settle}/orders`, data);
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
    updateOrder: null,
    /**
     * 
     * 
     * UPDATE ORDERS
     * 
     * 
     */
    updateOrders: null,
    /**
     * 
     * 
     * GET EQUITY
     * 
     * 
     */
    getEquity: async (params) => {
      const data = {};
      const response = await request.private('GET', `/api/v4/futures/${settle}/accounts`, data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data);
      }
      const equity = response.data.currency === params.asset ? (+response.data.total + +response.data.unrealised_pnl) : 0;
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
      const timestamp = moment.utc().startOf('minute').unix();
      const data = {};
      data.contract = params.symbol;
      data.from = moment.utc(params.start).unix();
      data.to = moment.utc(params.start).add(1000 * params.interval, 'milliseconds').unix();
      data.to = data.to < timestamp ? data.to : timestamp;
      data.interval = getCandleResolution(params.interval);
      const response = await request.public('GET', `/api/v4/futures/${settle}/candlesticks`, data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data);
      }
      const candles = response.data.map(v => {
        const candle = {};
        candle.timestamp = moment.unix(+v.t).utc().format('YYYY-MM-DD HH:mm:ss');
        candle.open = +v.o;
        candle.high = +v.h;
        candle.low = +v.l;
        candle.close = +v.c;
        candle.volume = +v.v;
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
      const response = await request.private('GET', `/api/v4/futures/${settle}/positions/${params.symbol}`, data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data);
      }
      const qtyS = +response.data.size < 0 ? Math.abs(+response.data.size) : 0;
      const qtyB = +response.data.size > 0 ? Math.abs(+response.data.size) : 0;
      const pxS = +response.data.size < 0 ? +response.data.entry_price : 0;
      const pxB = +response.data.size > 0 ? +response.data.entry_price : 0;
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
      data.contract = params.symbol;
      const response = await request.public('GET', `/api/v4/futures/${settle}/tickers`, data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data);
      }
      const price = +response.data[0].last;
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
      // Get tickers 
      const tickersData = {};
      tickersData.contract = params.symbol;
      const tickersResponse = await request.public('GET', `/api/v4/futures/${settle}/tickers`, tickersData);
      if (tickersResponse.status >= 400) {
        return handleResponseError(params, tickersResponse.data);
      }
      // Get position
      const positionData = {};
      const positionResponse = await request.private('GET', `/api/v4/futures/${settle}/positions/${params.symbol}`, positionData);
      if (positionResponse.status >= 400) {
        return handleResponseError(params, positionResponse.data);
      }
      // Calculate liquidation
      const markPx = +tickersResponse.data[0].mark_price;
      const liqPxS = +positionResponse.data.size < 0 ? +positionResponse.data.liq_price : 0;
      const liqPxB = +positionResponse.data.size > 0 ? +positionResponse.data.liq_price : 0;
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
      const response = await request.public('GET', `/api/v4/futures/${settle}/contracts/${params.symbol}`, data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data);
      }
      const current = +response.data.funding_rate;
      const nextFundingTime = moment.unix(+response.data.funding_next_apply).utc().format('YYYY-MM-DD HH:mm:ss');
      const fundings = { current, nextFundingTime };
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
     * GET INSTRUMENTS SYMBOLS
     * 
     * 
     */
    getInstrumentsSymbols: async () => {
      const data = {};
      const response = await request.public('GET', `/api/v4/futures/${settle}/contracts`, data);
      if (response.status >= 400) {
        return handleResponseError(null, response.data);
      }
      const symbols = response.data.map(v => v.name);
      return { data: symbols };
    },
    /**
     * 
     * 
     * GET INSTRUMENTS SYMBOLS
     * 
     * 
     */
    _getOrderBook: async (params) => {
      const data = {};
      data.contract = params.symbol;
      data.interval = '0';
      data.limit = 200;
      data.with_id = true;
      const response = await request.public('GET', `/api/v4/futures/${settle}/order_book`, data);
      if (response.status >= 400) {
        return handleResponseError(null, response.data);
      }
      const lastUpdateId = response.data.id;
      const asks = response.data.asks.map(ask => { return { id: +ask.p, price: +ask.p, quantity: +ask.s } });
      const bids = response.data.bids.map(bid => { return { id: +bid.p, price: +bid.p, quantity: +bid.s } });
      return { data: { asks, bids, lastUpdateId } };
    },
  };
  return rest;
};
module.exports = Rest;
