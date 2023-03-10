const Flatted = require('flatted');
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
 * @param {import('../../../typings/_rest').params | null} params
 * @param {Object | string} responseData 
 * @param {string} callingFunction
 * @returns {{ error: import('../../../typings/_rest').RestErrorResponseData<any> }}
 */
function handleResponseError(params, responseData, callingFunction) {
  /** @type {import('../../../typings/_rest').restErrorResponseDataType} */
  let type = 'unknown';
  if (+responseData.code !== 0) {
    if (+responseData.code === -2011) {
      type = 'order-not-found';
    }
    if (+responseData.code === -1003) {
      type = 'api-rate-limit';
    }
    if (+responseData.code === -2018 || +responseData.code === -2019) {
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
 * @returns {string | number}
 */
function getCandleResolution(interval) {
  if (interval === 60000) { return '1m' };
  if (interval === 180000) { return '3m' };
  if (interval === 300000) { return '5m' };
  if (interval === 900000) { return '15m' };
  if (interval === 1800000) { return '30m' };
  if (interval === 3600000) { return '1h' };
  if (interval === 7200000) { return '2h' };
  if (interval === 14400000) { return '4h' };
  if (interval === 21600000) { return '6h' };
  if (interval === 43200000) { return '12h' };
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
function getKeyFunction(restSettings) {
  /** 
   * @this {import('../../../typings/_rest').Request} 
   * @returns {Promise<import('../../../typings/_rest').requestSendReturn>}
   */
  async function key(method, path, data) {
    const dataStringified = qs.stringify(data);
    const requestSendParams = {
      url: `${restSettings.URL}${path}?${dataStringified}`,
      method: method,
      headers: { 'X-MBX-APIKEY': restSettings.API_KEY },
    };
    const response = await this.send(requestSendParams);
    return response;
  };
  return key;
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
    const privateData = {};
    privateData.timestamp = Date.now() - 500;
    privateData.recvWindow = 5000;
    const preSignatureData = Object.assign(data, privateData);
    const signature = crypto.createHmac('sha256', restSettings.API_SECRET)
      .update(qs.stringify(preSignatureData)).digest('hex');
    const dataSignature = Object.assign(preSignatureData, { signature });
    const dataStringified = qs.stringify(dataSignature);
    const requestSendParams = {
      url: `${restSettings.URL}${path}?${dataStringified}`,
      method: method,
      headers: { 'X-MBX-APIKEY': restSettings.API_KEY },
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
  restSettings.URL = restSettings.URL || 'https://api.binance.com';
  restSettings.REQUESTS_REFILL = restSettings.REQUESTS_REFILL || false;
  restSettings.REQUESTS_REFILL_LIMIT = restSettings.REQUESTS_REFILL_LIMIT || 1200;
  restSettings.REQUESTS_REFILL_AMOUNT = restSettings.REQUESTS_REFILL_AMOUNT || 1200;
  restSettings.REQUESTS_REFILL_INTERVAL = restSettings.REQUESTS_REFILL_INTERVAL || 60000;
  restSettings.REQUESTS_TIMESTAMPS = restSettings.REQUESTS_TIMESTAMPS || 10;
  // Request creation
  const REST_SETTINGS = restSettings;
  const KEY = getKeyFunction(restSettings);
  const PUBLIC = getPublicFunction(restSettings);
  const PRIVATE = getPrivateFunction(restSettings);
  const request = Request({ REST_SETTINGS, PUBLIC, KEY, PRIVATE });
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
      data.symbol = params.symbol;
      data.side = params.side.toUpperCase();
      data.quantity = `${params.quantity}`;
      data.newClientOrderId = params.id;
      if (params.type === 'limit') {
        data.type = 'LIMIT';
        data.price = `${params.price}`;
        data.timeInForce = 'GTC'
      }
      if (params.type === 'market') {
        data.type = 'MARKET';
      }
      if (params.type === 'post-only') {
        data.type = 'LIMIT_MAKER';
        data.price = `${params.price}`;
      }
      if (params.type === 'immidiate-or-cancel') {
        data.type = 'LIMIT';
        data.price = `${params.price}`;
        data.timeInForce = 'IOC';
      }
      const response = await request.private('POST', '/api/v3/order', data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data, 'createOrder');
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
    createOrders: async (params) => Promise.all(params.map(v => rest.createOrder(v))),
    /**
     * 
     * 
     * CANCEL ORDER
     * 
     * 
     */
    cancelOrder: async (params) => {
      const data = {};
      data.symbol = params.symbol;
      data.origClientOrderId = params.id;
      const response = await request.private('DELETE', '/api/v3/order', data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data, 'cancelOrder');
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
    cancelOrders: async (params) => Promise.all(params.map(v => rest.cancelOrder(v))),
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
      const response = await request.private('DELETE', '/api/v3/openOrders', data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data, 'cancelOrdersAll');
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
      const accountResponse = await request.private('GET', '/api/v3/account', data);
      if (accountResponse.status >= 400) {
        return handleResponseError(params, accountResponse.data, 'getEquity 1');
      }
      const lastPriceReponse = await request.public('GET', '/api/v3/ticker/price', null);
      if (lastPriceReponse.status >= 400) {
        return handleResponseError(params, lastPriceReponse.data, 'getEquity 2');
      }
      const lastPrices = lastPriceReponse.data;
      const balances = accountResponse.data.balances.filter(v => (+v.free || +v.locked))
      let equity = 0;
      if(balances.length) {
        balances.forEach(balance => {
          if(balance.asset == params.asset){
            equity = equity + (+balance.free + +balance.locked)
          } else {
            const balanceParams = lastPrices.find(v => v.symbol == (balance.asset + params.asset));
            const paramsBalance = lastPrices.find(v => v.symbol == (params.asset + balance.asset));
            if(balanceParams){
              equity = equity + (+balanceParams.price * (+balance.free + +balance.locked))
            } else if (paramsBalance){
              equity = equity + ((+balance.free + +balance.locked) / +paramsBalance.price)
            }
          }
        })
      }
      equity = +equity.toFixed(8)
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
      const timestamp = moment.utc().startOf('minute').valueOf();
      const data = {};
      data.symbol = params.symbol;
      data.interval = getCandleResolution(params.interval);
      data.startTime = moment.utc(params.start).valueOf();
      data.endTime = moment.utc(params.start).add(params.interval * 1499, 'milliseconds').valueOf();
      data.endTime = (data.endTime - data.startTime) < 17193600000 ? data.endTime
        : moment.utc(params.start).add(17193600000, 'milliseconds').valueOf();
      data.endTime = data.endTime < timestamp ? data.endTime : timestamp;
      data.limit = 950;
      const response = await request.public('GET', '/api/v3/klines', data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data, 'getCandles');
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
      const exchangeInfoResponse = await request.public('GET', '/api/v3/exchangeInfo', null);
      if (exchangeInfoResponse.status >= 400) {
        return handleResponseError(params, exchangeInfoResponse.data, 'getPosition 1');
      }
      const accountResponse = await request.private('GET', '/api/v3/account', data);
      if (accountResponse.status >= 400) {
        return handleResponseError(params, accountResponse.data, 'getEquity 1');
      }
      const symbolInformation = exchangeInfoResponse.data.symbols.filter(v => v.symbol == params.symbol)[0];
      const quoteBalance = accountResponse.data.balances.find(v => v.asset == symbolInformation.quoteAsset);

      const qtyS = (+quoteBalance.free + +quoteBalance.locked) ? (+quoteBalance.free + +quoteBalance.locked) : 0;
      const qtyB = 0;
      const pxS = 0;
      const pxB = 0;
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
      const response = await request.public('GET', '/api/v3/ticker/24hr', data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data, 'getLastPrice');
      }
      const price = +response.data.lastPrice;
      return { data: price };
    },
    /**
     * 
     * 
     * GET LIQUIDATION
     * 
     * 
     */
    getLiquidation: null,
    /**
     * 
     * 
     * GET FUNDING RATES
     * 
     * 
     */
    getFundingRates: null,
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
      const response = await request.public('GET', '/api/v3/exchangeInfo', data);
      if (response.status >= 400) {
        return handleResponseError(null, response.data, 'getInstrumentSymbols');
      }
      const symbols = response.data.symbols.map(v => v.symbol);
      return { data: symbols };
    },
    /**
     * 
     * 
     * GET LISTEN KEY
     * 
     * 
     */
    _getListenKey: async () => {
      const data = {};
      const response = await request.key('POST', '/api/v3/userDataStream', data);
      if (response.status >= 400) {
        return handleResponseError(null, response.data, '_getListenKey');
      }
      const listenKey = response.data.listenKey;
      return { data: listenKey };
    },
    /**
     * 
     * 
     * GET ORDER BOOK
     * 
     * 
     */
    _getOrderBook: async (params) => {
      const data = {};
      data.symbol = params.symbol;
      const response = await request.public('GET', '/api/v3/depth', data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data, '_getOrderBook');
      }
      const lastUpdateId = response.data.lastUpdateId;
      const asks = response.data.asks.map(v => {
        return { id: +v[0], price: +v[0], quantity: +v[1] };
      });
      const bids = response.data.bids.map(v => {
        return { id: +v[0], price: +v[0], quantity: +v[1] };
      });
      return { data: { asks, bids, lastUpdateId } };
    }
  };
  return rest;
};
module.exports = Rest;
