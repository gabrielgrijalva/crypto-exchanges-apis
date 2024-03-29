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
 * @param {import('../../../typings/_rest').params} params
 * @param {Object | string} responseData 
 * @param {string} callingFunction
 * @returns {{ error: import('../../../typings/_rest').RestErrorResponseData<any> }}
 */
function handleResponseError(params, responseData, callingFunction) {
  /** @type {import('../../../typings/_rest').restErrorResponseDataType} */
  let type = 'unknown';
  if (responseData && (responseData.code || responseData.sCode)) {
    const errorCode = responseData.code || responseData.sCode;
    if (errorCode === '50011') {
      type = 'api-rate-limit';
    }
    if (errorCode === '50004' || errorCode === '50102') {
      type = 'request-timeout';
    }
    if (errorCode === '50001' || errorCode === '50013' || errorCode === '50026' || errorCode === '51506') {
      type = 'request-not-accepted';
    }
    if (errorCode === '51008' || errorCode === '51127' || errorCode === '51131' || errorCode === '51502'
      || errorCode === '59200' || errorCode === '59303') {
      type = 'insufficient-funds';
    }
    if (errorCode === '51400' || errorCode === '51401' || errorCode === '51402' || errorCode === '51405'
      || errorCode === '51410' || errorCode === '51503' || errorCode === '51509' || errorCode === '51510'
      || errorCode === '51603') {
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
 */
function hrtimeToMilliseconds(hrtime) {
  return (hrtime[0] * 1000) + (hrtime[1] / 1e6);
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
  async function private(method, path, data, query) {
    const timestamp = moment.utc().format('YYYY-MM-DD[T]HH:mm:ss.SSS[Z]');
    const dataStringified = data ? JSON.stringify(data) : '';
    const queryStrigified = query ? `?${qs.stringify(query)}` : '';
    const digest = `${timestamp}${method}${path}${queryStrigified}${dataStringified}`;
    const signature = crypto.createHmac('sha256', restSettings.API_SECRET).update(digest).digest('base64');
    const requestSendParams = {
      url: `${restSettings.URL}${path}${queryStrigified}`,
      data: dataStringified,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'OK-ACCESS-KEY': restSettings.API_KEY,
        'OK-ACCESS-SIGN': signature,
        'OK-ACCESS-TIMESTAMP': timestamp,
        'OK-ACCESS-PASSPHRASE': restSettings.API_PASSPHRASE,
      },
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
  restSettings.URL = restSettings.URL || 'https://aws.okx.com';
  restSettings.REQUESTS_REFILL = restSettings.REQUESTS_REFILL || false;
  restSettings.REQUESTS_REFILL_LIMIT = restSettings.REQUESTS_REFILL_LIMIT || 60;
  restSettings.REQUESTS_REFILL_AMOUNT = restSettings.REQUESTS_REFILL_AMOUNT || 60;
  restSettings.REQUESTS_REFILL_INTERVAL = restSettings.REQUESTS_REFILL_INTERVAL || 2000;
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
      data.instId = params.symbol;
      data.tdMode = 'cross';
      data.clOrdId = params.id;
      data.side = params.side;
      data.posSide = 'net';
      data.sz = `${params.quantity}`;
      if (params.type === 'limit') {
        data.px = `${params.price}`;
        data.ordType = 'limit';
      }
      if (params.type === 'market') {
        data.ordType = 'market';
      }
      if (params.type === 'post-only') {
        data.px = `${params.price}`;
        data.ordType = 'post_only';
      }
      if (params.type === 'immidiate-or-cancel') {
        data.px = `${params.price}`;
        data.ordType = 'ioc';
      }
      let start = process.hrtime();
      const response = await request.private('POST', '/api/v5/trade/order', data);
      let end = process.hrtime(start);
      console.log(`Create orderId: ${data.clOrdId}, RTT: ${hrtimeToMilliseconds(end)} ms`)

      if (response.data.code !== '0') {
        return handleResponseError(params, response.data.data[0] || response.data, 'createOrder');
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
        if (v.type === 'limit') {
          orderData.px = `${v.price}`;
          orderData.ordType = 'limit';
        }
        if (v.type === 'market') {
          orderData.ordType = 'market';
        }
        if (v.type === 'post-only') {
          orderData.px = `${v.price}`;
          orderData.ordType = 'post_only';
        }
        if (v.type === 'immidiate-or-cancel') {
          orderData.px = `${v.price}`;
          orderData.ordType = 'ioc';
        }
        return orderData;
      });
      let start = process.hrtime();
      const response = await request.private('POST', '/api/v5/trade/batch-orders', data);
      let end = process.hrtime(start);
      console.log(`Create orders: ${data}, RTT: ${hrtimeToMilliseconds(end)} ms`)

      if (response.data.code !== '0') {
        return params.map((v, i) => handleResponseError(v, response.data.data[i] || response.data, 'createOrders 1'));
      }
      return response.data.data.map((v, i) => {
        if (v.sCode !== '0') { return handleResponseError(params[i], v, 'createOrders 2') };
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
      let start = process.hrtime();
      const response = await request.private('POST', '/api/v5/trade/cancel-order', data);
      let end = process.hrtime(start);
      console.log(`Cancel orderId: ${data.clOrdId}, RTT: ${hrtimeToMilliseconds(end)} ms`)

      if (response.data.code !== '0') {
        return handleResponseError(params, response.data.data[0] || response.data, 'cancelOrder');
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
      let start = process.hrtime();
      const response = await request.private('POST', '/api/v5/trade/cancel-batch-orders', data);
      let end = process.hrtime(start);
      console.log(`Cancel orders: ${data}, RTT: ${hrtimeToMilliseconds(end)} ms`)

      if (response.data.code !== '0') {
        return params.map((v, i) => handleResponseError(v, response.data.data[i] || response.data, 'cancelOrders 1'));
      }
      return response.data.data.map((v, i) => {
        if (v.sCode !== '0') { return handleResponseError(params[i], v, 'cancelOrders 2') };
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
      let start = process.hrtime();
      const ordersResponse = await request.private('GET', '/api/v5/trade/orders-pending', null, ordersData);
      let end = process.hrtime(start);
      console.log(`Cancel orders all pending, RTT: ${hrtimeToMilliseconds(end)} ms`)

      if (ordersResponse.data.code !== '0') {
        return handleResponseError(params, ordersResponse.data.data[0] || ordersResponse.data, 'cancelOrdersAll 1');
      }
      if (!ordersResponse.data.data.length) {
        return { data: params }
      };
      // Cancel open orders
      const cancelData = ordersResponse.data.data.map(v => {
        return { instId: params.symbol, ordId: v.ordId };
      });
      start = process.hrtime();
      const cancelResponse = await request.private('POST', '/api/v5/trade/cancel-batch-orders', cancelData);
      end = process.hrtime(start);
      console.log(`Cancel orders all batch, RTT: ${hrtimeToMilliseconds(end)} ms`)

      if (cancelResponse.data.code !== '0') {
        return handleResponseError(params, cancelResponse.data.data[0] || cancelResponse.data, 'cancelOrdersAll 2');
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
      let start = process.hrtime();
      const response = await request.private('POST', '/api/v5/trade/amend-order', data);
      let end = process.hrtime(start);
      console.log(`Update orderId: ${data.clOrdId}, RTT: ${hrtimeToMilliseconds(end)} ms`)

      if (response.data.code !== '0') {
        return handleResponseError(params, response.data.data[0] || response.data, 'updateOrder');
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
      let start = process.hrtime();
      const response = await request.private('POST', '/api/v5/trade/amend-batch-orders', data);
      let end = process.hrtime(start);
      console.log(`Update orders: ${data}, RTT: ${hrtimeToMilliseconds(end)} ms`)

      if (response.data.code !== '0') {
        return params.map((v, i) => handleResponseError(v, response.data.data[i] || response.data, 'updateOrders 1'));
      }
      return response.data.data.map((v, i) => {
        if (v.sCode !== '0') { return handleResponseError(params[i], v, 'updateOrders 2') };
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
        return handleResponseError(params, response.data.data[0] || response.data, 'getEquity');
      }
      const asset = response.data.data[0].details.find(v => v.ccy === params.asset);
      const equity = asset ? +asset.eq : 0;
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
      data.instId = params.symbol;
      data.bar = getCandleResolution(params.interval);
      data.limit = '100';
      data.after = `${moment.utc(params.start).add(params.interval * 100, 'milliseconds').valueOf()}`;
      const response = await request.public('GET', '/api/v5/market/history-candles', data);
      if (response.data.code !== '0') {
        return handleResponseError(params, response.data.data[0] || response.data, 'getCandles');
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
        if (response && response.data && response.data.data){
          return handleResponseError(params, response.data.data[0], 'getPosition 1');
        }
        return handleResponseError(params, response.data, 'getPosition 2');
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
        return handleResponseError(params, response.data.data[0] || response.data, 'getLastPrice');
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
        return handleResponseError(params, markResponse.data.data[0] || markResponse.data, 'getLiquidation 1');
      }
      // Get position
      const positionData = {};
      positionData.instId = params.symbol;
      const positionResponse = await request.private('GET', '/api/v5/account/positions', null, positionData);
      if (positionResponse.data.code !== '0') {
        return handleResponseError(params, positionResponse.data.data[0] || positionResponse.data, 'getLiquidation 2');
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
        return handleResponseError(params, response.data.data[0] || response.data, 'getFundingRates');
      }
      const fundingRate = response.data.data.find(v => v.instId === params.symbol);
      const current = fundingRate ? +fundingRate.fundingRate : 0;
      const estimated = fundingRate ? +fundingRate.nextFundingRate : 0;
      const nextFundingTime = fundingRate ? moment.unix(+fundingRate.fundingTime/1000).utc().format('YYYY-MM-DD HH:mm:ss') : undefined;
      const fundings = { current, estimated, nextFundingTime };
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
      const dataSpot = { instType: 'SPOT' };
      const dataSwap = { instType: 'SWAP' };
      const dataOption = { instType: 'OPTION' };
      const dataFutures = { instType: 'FUTURES' };
      const responseSpot = await request.public('GET', '/api/v5/market/ticker', dataSpot);
      const responseSwap = await request.public('GET', '/api/v5/market/ticker', dataSwap);
      const responseOption = await request.public('GET', '/api/v5/market/ticker', dataOption);
      const responseFutures = await request.public('GET', '/api/v5/market/ticker', dataFutures);
      if (responseSpot.data.code !== '0') { return handleResponseError(null, responseSpot.data.data[0] || responseSpot.data, 'getInstrumentsSymbols 1') };
      if (responseSwap.data.code !== '0') { return handleResponseError(null, responseSwap.data.data[0] || responseSwap.data, 'getInstrumentsSymbols 2') };
      if (responseOption.data.code !== '0') { return handleResponseError(null, responseOption.data.data[0] || responseOption.data, 'getInstrumentsSymbols 3') };
      if (responseFutures.data.code !== '0') { return handleResponseError(null, responseFutures.data.data[0] || responseFutures.data, 'getInstrumentsSymbols 4') };
      const symbols = [].concat(responseSpot.data.data).concat(responseSwap.data.data).concat(responseOption.data.data).concat(responseFutures.data.data).map(v => v.instId);
      return { data: symbols };
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
      data.sz = 400;
      data.instId = params.symbol;
      const response = await request.public('GET', '/api/v5/market/books', data);
      if (response.data.code !== '0') {
        return handleResponseError(params, response.data.data[0] || response.data, '_getOrderBook');
      }
      const asks = response.data.data[0].asks.map(ask => {
        return { id: +ask[0], price: +ask[0], quantity: +ask[1] };
      });
      const bids = response.data.data[0].bids.map(bid => {
        return { id: +bid[0], price: +bid[0], quantity: +bid[1] };
      });
      const lastUpdateId = +response.data.data[0].ts;
      return { data: { asks, bids, lastUpdateId } };
    },
  };
  return rest;
};
module.exports = Rest;
