const Flatted = require('flatted');
const qs = require('qs');
const utf8 = require('utf8');
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
 * @param {string} callingFunction
 * @returns {{ error: import('../../../typings/_rest').RestErrorResponseData<any> }}
 */
function handleResponseError(params, responseData, callingFunction) {
  /** @type {import('../../../typings/_rest').restErrorResponseDataType} */
  let type = 'unknown';
  if (responseData.error) {
    if (responseData.error === 'apiLimitExceeded') {
      type = 'api-rate-limit';
    }
    if (responseData.error === 'nonceDuplicate'
      || responseData.error === 'nonceBelowThreshold') {
      type = 'request-not-accepted';
    }
  }
  if (responseData.status || responseData.sendStatus || responseData.editStatus || responseData.cancelStatus) {
    const status = responseData.status || (responseData.sendStatus || responseData.editStatus || responseData.cancelStatus).status;
    if (status === 'postWouldExecute') {
      type = 'post-only-reject';
    }
    if (status === 'iocWouldNotExecute') {
      type = 'immidiate-or-cancel-reject';
    }
    if (status === 'insufficientAvailableFunds') {
      type = 'insufficient-funds';
    }
    if (status === 'filled' || status === 'notFound' || status === 'noOrdersToCancel' || status === 'orderForEditNotFound') {
      type = 'order-not-found';
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
  if (interval === 300000) { return '5m' };
  if (interval === 900000) { return '15m' };
  if (interval === 1800000) { return '30m' };
  if (interval === 3600000) { return '1h' };
  if (interval === 14400000) { return '4h' };
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
      url: `${path}?${dataStringified}`,
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
    const seconds = Math.floor(Date.now() / 1000).toString();
    const microseconds = Math.floor(process.hrtime()[1] / 1000).toString();
    const micLeadingZeros = '0'.repeat(6 - microseconds.length);
    const nonce = `${seconds}${micLeadingZeros}${microseconds}`;
    const dataStringified = typeof data === 'string' ? data : qs.stringify(data);
    const digest = dataStringified + nonce + path;
    const hash = crypto.createHash('sha256').update(utf8.encode(digest)).digest();
    const decoded = Buffer.from(restSettings.API_SECRET, 'base64');
    const authent = crypto.createHmac('sha512', decoded).update(hash).digest('base64');
    const requestSendParams = {
      url: `${restSettings.URL}${path}?${encodeURI(dataStringified)}`,
      method: method,
      headers: { 'Accept': 'application/json', 'APIKey': restSettings.API_KEY, 'Nonce': nonce, 'Authent': authent },
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
  restSettings.URL = restSettings.URL || 'https://api.futures.kraken.com/derivatives';
  restSettings.REQUESTS_REFILL = restSettings.REQUESTS_REFILL || false;
  restSettings.REQUESTS_REFILL_LIMIT = restSettings.REQUESTS_REFILL_LIMIT || 50;
  restSettings.REQUESTS_REFILL_AMOUNT = restSettings.REQUESTS_REFILL_AMOUNT || 50;
  restSettings.REQUESTS_REFILL_INTERVAL = restSettings.REQUESTS_REFILL_INTERVAL || 10000;
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
      data.side = params.side;
      data.size = params.quantity;
      data.symbol = params.symbol;
      data.cliOrdId = params.id;
      if (params.type === 'limit') {
        data.orderType = 'lmt';
        data.limitPrice = params.price;
      }
      if (params.type === 'market') {
        data.orderType = 'mkt';
      }
      if (params.type === 'post-only') {
        data.orderType = 'post';
        data.limitPrice = params.price;
      }
      if (params.type === 'immidiate-or-cancel') {
        data.orderType = 'ioc';
        data.limitPrice = params.price;
      }
      const response = await request.private('POST', '/api/v3/sendorder', data);
      if (response.status >= 400
        || response.data.error
        || !response.data.sendStatus
        || response.data.sendStatus.status !== 'placed') {
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
    createOrders: async (params) => {
      const data = {};
      data.batchOrder = params.map(v => {
        const orderData = {};
        orderData.order = 'send';
        orderData.order_tag = 'ardaga';
        orderData.side = v.side;
        orderData.size = v.quantity;
        orderData.symbol = v.symbol;
        orderData.cliOrdId = v.id;
        if (v.type === 'limit') {
          orderData.orderType = 'lmt';
          orderData.limitPrice = v.price;
        }
        if (v.type === 'market') {
          orderData.orderType = 'mkt';
        }
        if (v.type === 'post-only') {
          orderData.orderType = 'post';
          orderData.limitPrice = v.price;
        }
        if (v.type === 'immidiate-or-cancel') {
          orderData.orderType = 'ioc';
          orderData.limitPrice = v.price;
        }
        return orderData;
      });
      const dataStr = `json=${JSON.stringify(data)}`;
      const response = await request.private('POST', '/api/v3/batchorder', dataStr);
      if (response.status >= 400
        || response.data.error
        || !response.data.batchStatus) {
        return params.map(v => handleResponseError(v, response.data, 'createOrders 1'));
      }
      return response.data.batchStatus.map((v, i) => {
        if (v.status !== 'placed') {
          return handleResponseError(params[i], v, 'createOrders 2');
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
      data.cliOrdId = params.id;
      const response = await request.private('POST', '/api/v3/cancelorder', data);
      if (response.status >= 400
        || response.data.error
        || !response.data.cancelStatus
        || response.data.cancelStatus.status !== 'cancelled') {
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
    cancelOrders: async (params) => {
      const data = {};
      data.batchOrder = params.map(v => {
        const orderData = {};
        orderData.order = 'cancel';
        orderData.cliOrdId = v.id;
        orderData.order_tag = 'ardaga';
        return orderData;
      });
      const dataStr = `json=${JSON.stringify(data)}`;
      const response = await request.private('POST', '/api/v3/batchorder', dataStr);
      if (response.status >= 400
        || response.data.error
        || !response.data.batchStatus) {
        return params.map(v => handleResponseError(v, response.data, 'cancelOrders 1'));
      }
      return response.data.batchStatus.map((v, i) => {
        if (v.status !== 'cancelled') {
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
      const response = await request.private('POST', '/api/v3/cancelallorders', data);
      if (response.status >= 400
        || response.data.error
        || !response.data.cancelStatus
        || response.data.cancelStatus.status !== 'cancelled') {
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
      const response = await request.private('GET', '/api/v3/accounts', data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data, 'getEquity');
      }
      const equity = response.data.accounts[params.asset].auxiliary.pv;
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
      const symbol = params.symbol;
      const interval = getCandleResolution(params.interval);
      data.from = moment.utc(params.start).unix();
      data.to = moment.utc(params.start).add(5000 * params.interval, 'milliseconds').unix();
      data.to = data.to < timestamp ? data.to : timestamp;
      const response = await request.public('GET', `https://futures.kraken.com/api/charts/v1/trade/${symbol}/${interval}`, data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data, 'getCandles');
      }
      const candles = response.data.candles.map(v => {
        const candle = {};
        candle.timestamp = moment(v.time).utc().format('YYYY-MM-DD HH:mm:ss');
        candle.open = +v.open;
        candle.high = +v.high;
        candle.low = +v.low;
        candle.close = +v.close;
        candle.volume = +v.volume;
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
      const response = await request.private('GET', '/api/v3/openpositions', data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data, 'getPosition');
      }
      const positionResult = Array.isArray(response.data.openPositions)
        ? response.data.openPositions.find(v => params.symbol.toLowerCase() === v.symbol.toLowerCase()) : null;
      const qtyS = positionResult && positionResult.side === 'short' ? +positionResult.size : 0;
      const qtyB = positionResult && positionResult.side === 'long' ? +positionResult.size : 0;
      const pxS = positionResult && positionResult.side === 'short' ? +positionResult.price : 0;
      const pxB = positionResult && positionResult.side === 'long' ? +positionResult.price : 0;
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
      const response = await request.public('GET', `${restSettings.URL}/api/v3/tickers`, data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data, '');
      }
      const price = +response.data.tickers.find(v => params.symbol.toLowerCase() === v.symbol.toLowerCase()).last;
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
      const tickersResponse = await request.public('GET', `${restSettings.URL}/api/v3/tickers`, tickersData);
      if (tickersResponse.status >= 400) {
        return handleResponseError(params, tickersResponse.data, 'getLiquidation 1');
      }
      // Get accounts
      const accountsData = {};
      const accountsResponse = await request.private('GET', '/api/v3/accounts', accountsData);
      if (accountsResponse.status >= 400) {
        return handleResponseError(params, accountsResponse.data, 'getLiquidation 2');
      }
      // Get positions
      const positionsData = {};
      const positionsResponse = await request.private('GET', '/api/v3/openpositions', positionsData);
      if (positionsResponse.status >= 400) {
        return handleResponseError(params, positionsResponse.data, 'getLiquidation 3');
      }
      // Calculate liquidation
      const ticker = tickersResponse.data.tickers.find(v => params.symbol.toLowerCase() === v.symbol.toLowerCase());
      const account = accountsResponse.data.accounts[params.asset];
      const position = Array.isArray(positionsResponse.data.openPositions) ? positionsResponse
        .data.openPositions.find(v => params.symbol.toLowerCase() === v.symbol.toLowerCase()) : null;
      const markPx = +ticker.markPrice;
      const liqPxS = position && position.side === 'short' && +position.size ? +account.triggerEstimates.lt : 0;
      const liqPxB = position && position.side === 'long' && +position.size ? +account.triggerEstimates.lt : 0;
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
      const response = await request.public('GET', `${restSettings.URL}/api/v3/tickers`, data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data, 'getFundingRates');
      }
      const ticker = response.data.tickers.find(v => params.symbol.toLowerCase() === v.symbol.toLowerCase());
      const current = +ticker.fundingRate / (1 / +ticker.last);
      const estimated = +ticker.fundingRatePrediction / (1 / +ticker.last);
      const fundings = { current, estimated };
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
      const response = await request.public('GET', `${restSettings.URL}/api/v3/tickers`, data);
      if (response.status >= 400) {
        return handleResponseError(null, response.data, 'getInstrumentsSymbols');
      }
      const symbols = response.data.tickers.map(v => v.symbol.toUpperCase());
      return { data: symbols };
    },
  };
  return rest;
};
module.exports = Rest;
