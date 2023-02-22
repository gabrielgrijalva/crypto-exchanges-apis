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
 * @returns {{ error: import('../../../typings/_rest').RestErrorResponseData<any> }}
 */
function handleResponseError(params, responseData) {
  /** @type {import('../../../typings/_rest').restErrorResponseDataType} */
  let type = 'unknown';
  if (responseData.code) {
    const errorCode = (responseData.code).toString();
    switch (errorCode)
    {
      case '1000':
        type = 'no-function';
        break;
      case '1017':
        type = 'order-not-found';
        break;
      case '0':
        type = 'post-only-reject';
        break;
      case '1047':
        type = 'insufficient-funds';
        break;
      case '40019':
        type = 'request-not-accepted';
        break; 
      case '0':
        type = 'immidiate-or-cancel-reject';
        break; 
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
  if (interval === 180000) { return '3m' };
  if (interval === 300000) { return '5m' };
  if (interval === 900000) { return '15m' };
  if (interval === 1800000) { return '30m' };
  if (interval === 3600000) { return '1H' };
  if (interval === 7200000) { return '2H' };
  if (interval === 14400000) { return '4H' };
  if (interval === 21600000) { return '6Hutc' };
  if (interval === 43200000) { return '12Hutc' };
  if (interval === 86400000) { return '1Dutc' };
};
/**
 * @param {string} symbol 
 * @returns {string}
 */
function getAssetFromSymbol(symbol) {
  let asset = ''
  if (symbol.includes('UMCBL')){
    asset = 'USDT';
  } else if (symbol.includes('CMCBL')) {
    asset = 'USDC';
  } else if (symbol.includes('SDMCBL')) {
    asset = symbol.replace('SUSD_SDMCBL', '')
  } else if (symbol.includes('DMCBL')) {
    asset = symbol.replace('USD_DMCBL', '')
  }
  return asset;
}
/**
 * @param {string} symbol 
 * @returns {string}
 */
function getProductTypeFromSymbol(symbol) {
  return symbol.split("_")[1].toLowerCase();
}
/**
 * @param {string} asset 
 * @returns {string}
 */
function getProductTypeFromAsset(asset) {
  let productType = '';
  switch (asset) {
    case 'USDT':
      productType = 'umcbl'
      break;
    case 'USDC':
      productType = 'cmcbl'
      break;
    default:
      productType = 'dmcbl'
  }
  return productType;
}
/**
 * @param {string} side 
 * @param {number} size 
 * @param {number} openPrice 
 * @param {number} markPrice 
 * @returns {number}
 */
function calculateUplInverse(side, size, openPrice, markPrice) {
  let upl = 0;
  if(side && size && openPrice && markPrice){
    size = side == 'long' ? size : -size;
    upl = (1/openPrice - 1/markPrice) * (size * markPrice);
  }
  return upl;
}
/**
 * @param {string} side 
 * @param {number} initialMargin 
 * @param {number} upl 
 * @param {number} marginRatio 
 * @param {number} markPrice 
 * @param {number} positionSize 
 * @returns {number}
 */
function calculateLiquidationPriceInverse(side, initialMargin, upl, marginRatio, markPrice, positionSize) {
  let liquidationPrice = 0;
  if(side && initialMargin && upl && marginRatio && markPrice && positionSize){
    if(side == 'long'){
      liquidationPrice = (1 - ((initialMargin + upl - (marginRatio * (initialMargin + upl))) * markPrice) /(positionSize * markPrice)) * markPrice;
    }
    if(side == 'short'){
      liquidationPrice = (1 + ((initialMargin + upl - (marginRatio * (initialMargin + upl))) * markPrice) /(positionSize * markPrice)) * markPrice;
    }
  }
  return +liquidationPrice.toFixed(10);
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
    const timestamp = Date.now();
    const dataStringified = data ? JSON.stringify(data) : '';
    const queryStrigified = query ? `?${qs.stringify(query)}` : '';
    const digest = `${timestamp}${method.toUpperCase()}${path}${queryStrigified}${dataStringified}`;
    const signature = crypto.createHmac('sha256', restSettings.API_SECRET).update(digest).digest('base64');
    const requestSendParams = {
      url: `${restSettings.URL}${path}${queryStrigified}`,
      data: dataStringified,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'locale': 'en-US',
        'ACCESS-KEY': restSettings.API_KEY,
        'ACCESS-SIGN': signature,
        'ACCESS-TIMESTAMP': timestamp,
        'ACCESS-PASSPHRASE': restSettings.API_PASSPHRASE,
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
  restSettings.URL = restSettings.URL || 'https://api.bitget.com';
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
      data.symbol = params.symbol;
      data.marginCoin = getAssetFromSymbol(params.symbol);
      data.size = params.quantity;
      data.side = params.side == 'buy' ? 'buy_single' : 'sell_single';
      if (params.type === 'market') {
        data.orderType = 'market';
      }
      if (params.type === 'limit') {
        data.price = params.price;
        data.orderType = 'limit';
      }
      if (params.type === 'post-only') {
        data.price = params.price;
        data.orderType = 'limit';
        data.timeInForceValue = 'post_only';
      }
      if (params.type === 'immidiate-or-cancel') {
        data.price = params.price;
        data.orderType = 'limit';
        data.timeInForceValue = 'ioc';
      }
      const response = await request.private('POST', '/api/mix/v1/order/placeOrder', data);
      if (response.data.code !== '00000') {
        return handleResponseError(params, response.data);
      }
      params.id = response.data.data.orderId
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
      data.marginCoin = getAssetFromSymbol(params.symbol);
      data.orderId = params.id;
      const response = await request.private('POST', '/api/mix/v1/order/cancel-order', data);
      if (response.data.code !== '00000') {
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
    cancelOrders: async (params) => Promise.all(params.map(v => rest.cancelOrder(v))),
    /**
     * 
     * 
     * CANCEL ORDERS ALL
     * 
     * 
     */
    cancelOrdersAll: async (params) => {
      // Get open orders
      const data = {};
      data.productType = getProductTypeFromSymbol(params.symbol);
      data.marginCoin = getAssetFromSymbol(params.symbol);
      const response = await request.private('POST', '/api/mix/v1/order/cancel-all-orders', data);
      if (response.data.code !== '00000') {
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
      data.productType = getProductTypeFromAsset(params.asset)
      const response = await request.private('GET', '/api/mix/v1/account/accounts', null, data);
      if (response.data.code && response.data.code !== '00000') {
        return handleResponseError(params, response.data);
      }
      const asset = response.data.data.find(v => v.marginCoin === params.asset);
      const equity = asset ? +asset.equity : 0;
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
      data.symbol = params.symbol.toUpperCase();
      data.granularity = getCandleResolution(params.interval);
      data.startTime = moment.utc(params.start).valueOf();
      data.endTime = moment.utc(params.start).add(params.interval * 100, 'milliseconds').valueOf();
      data.endTime = data.endTime >= Date.now() ? Date.now() : data.endTime;
      const response = await request.public('GET', '/api/mix/v1/market/candles', data);
      if (response.data.code && response.data.code !== '00000') {
        return handleResponseError(params, response.data);
      }
      const candles = response.data.map(v => {
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
      data.symbol = params.symbol;
      data.marginCoin = getAssetFromSymbol(params.symbol);
      const response = await request.private('GET', '/api/mix/v1/position/singlePosition', null, data);
      if (response.data.code && response.data.code !== '00000') {
        return handleResponseError(params, response.data);
      }
      const positionDataLong = response.data.data.find(v => v.holdSide === 'long');
      const positionDataShort = response.data.data.find(v => v.holdSide === 'short');
      const qtyS = positionDataShort && +positionDataShort.total > 0 ? Math.abs(+positionDataShort.total) : 0;
      const qtyB = positionDataLong && +positionDataLong.total > 0 ? Math.abs(+positionDataLong.total) : 0;
      const pxS = positionDataShort && +positionDataShort.total > 0 ? +positionDataShort.averageOpenPrice : 0;
      const pxB = positionDataLong && +positionDataLong.total > 0 ? +positionDataLong.averageOpenPrice : 0;
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
      const response = await request.public('GET', '/api/mix/v1/market/ticker', data);
      if (response.data.code && response.data.code  !== '00000') {
        return handleResponseError(params, response.data);
      }
      const price = +response.data.data.last;
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
      markData.symbol = params.symbol;
      const markResponse = await request.public('GET', '/api/mix/v1/market/mark-price', markData);
      if (markResponse.data.code && markResponse.data.code  !== '00000') {
        return handleResponseError(params, markResponse.data);
      }
      // Get position
      const positionData = {};
      positionData.symbol = params.symbol;
      positionData.marginCoin = getAssetFromSymbol(params.symbol);
      const positionResponse = await request.private('GET', '/api/mix/v1/position/singlePosition', null, positionData);
      if (positionResponse.data.code && positionResponse.data.code  !== '00000') {
        return handleResponseError(params, positionResponse.data);
      }
      // Get equity
      const equityData = {};
      equityData.symbol = params.symbol;
      equityData.marginCoin = getAssetFromSymbol(params.symbol);
      const equityResponse = await request.private('GET', '/api/mix/v1/account/account', null, equityData);
      if (equityResponse.data.code && equityResponse.data.code  !== '00000') {
        return handleResponseError(params, equityResponse.data);
      }
      
      // Calculate liquidation
      const positionResponseData = positionResponse.data.data.find(v => v.symbol === params.symbol && v.total > 0);
      const equityResponseData = equityResponse.data.data;
      const markResponseData = markResponse.data.data;

      const uplData = {};
      uplData.side = positionResponseData ? positionResponseData.holdSide : 0;
      uplData.positionSize = positionResponseData ? positionResponseData.total : 0;
      uplData.openPrice = positionResponseData ? positionResponseData.averageOpenPrice : 0;
      uplData.markPrice = markResponseData? markResponseData.markPrice : 0;
      const upl = calculateUplInverse(uplData.side, uplData.positionSize, uplData.openPrice, uplData.markPrice);

      const liquidationData = {};
      liquidationData.side = positionResponseData ? positionResponseData.holdSide : 0;
      liquidationData.initialMargin = equityResponseData && upl ? equityResponseData.equity - upl : 0;
      liquidationData.upl = upl ? upl : 0;
      liquidationData.marginRatio = positionResponseData ? positionResponseData.keepMarginRate : 0;
      liquidationData.markPrice = markResponseData? markResponseData.markPrice : 0;
      liquidationData.positionSize = positionResponseData ? positionResponseData.total : 0;
      const liquidationPrice = calculateLiquidationPriceInverse(liquidationData.side, liquidationData.initialMargin, liquidationData.upl, liquidationData.marginRatio, liquidationData.markPrice, liquidationData.positionSize)

      const markPx = markResponseData? +markResponseData.markPrice : 0;
      const liqPxS = positionResponseData && positionResponseData.holdSide == 'short' ? +liquidationPrice : 0;
      const liqPxB = positionResponseData && positionResponseData.holdSide == 'long' ? +liquidationPrice : 0;
      const liquidation = { markPx, liqPxS, liqPxB };
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
      const response = await request.public('GET', '/api/mix/v1/market/current-fundRate', data);
      if (response.data.code && response.data.code  !== '00000') {
        return handleResponseError(params, response.data);
      }
      const current = response.data.data ? +response.data.data.fundingRate : 0;
      const fundings = { current };
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
      const usdtPerp = { productType: 'umcbl' };
      const usdcPerp = { productType: 'cmcbl' };
      const universalMarginPerp = { productType: 'dmcbl' };
      const responseUsdtPerp = await request.public('GET', '/api/mix/v1/market/contracts', usdtPerp);
      const responseUsdcPerp = await request.public('GET', '/api/mix/v1/market/contracts', usdcPerp);
      const responseUniversalMarginPerp = await request.public('GET', '/api/mix/v1/market/contracts', universalMarginPerp);
      if (responseUsdtPerp.data.code && responseUsdtPerp.data.code  !== '00000') { return handleResponseError(null, responseUsdtPerp.data) };
      if (responseUsdcPerp.data.code && responseUsdcPerp.data.code  !== '00000') { return handleResponseError(null, responseUsdcPerp.data) };
      if (responseUniversalMarginPerp.data.code && responseUniversalMarginPerp.data.code  !== '00000') { return handleResponseError(null, responseUniversalMarginPerp.data) };
      const symbols = [].concat(responseUsdtPerp.data.data).concat(responseUsdcPerp.data.data).concat(responseUniversalMarginPerp.data.data).map(v => v.symbol);
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
      data.limit = 100;
      data.symbol = params.symbol;
      const response = await request.public('GET', '/api/mix/v1/market/depth', data);
      if (response.data.code && response.data.code  !== '00000') {
        return handleResponseError(params, response.data);
      }
      const asks = response.data.data.asks.map(ask => {
        return { id: +ask[0], price: +ask[0], quantity: +ask[1] };
      });
      const bids = response.data.data.bids.map(bid => {
        return { id: +bid[0], price: +bid[0], quantity: +bid[1] };
      });
      const lastUpdateId = +response.data.data.timestamp;
      return { data: { asks, bids, lastUpdateId } };
    },
  };
  return rest;
};
module.exports = Rest;
