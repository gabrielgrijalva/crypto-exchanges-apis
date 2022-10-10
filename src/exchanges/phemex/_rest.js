const qs = require('qs');
const crypto = require('crypto');
const moment = require('moment');
const Request = require('../../_shared-classes/request');
const wait = require('../../_utils/wait');

// Phemex Exclusive Settings Scale

const priceScale = 10000;
const ratioScale = 100000000;
const valueScale = 100000000;

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
      case '11006':
        type = 'no-function';
        break;
      case '10002':
        type = 'order-not-found';
        break;
      case '101':
        type = 'post-only-reject';
        break;
      case '11001':
      case '11003':
      case '11005':
      case '11010':
        type = 'insufficient-funds';
        break;
      case '19999':
      case '10001':
      case '10003':
      case '10004':
      case '10005':
      case '10035':
      case '10037':
      case '11053':
      case '11055':
      case '11056':
      case '11058':
      case '10500':
        type = 'request-not-accepted';
        break; 
      case '11015':
        type = 'immidiate-or-cancel-reject';
        break; 
    }
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
  if (interval === 60000) { return 60 };
  if (interval === 300000) { return 300 };
  if (interval === 900000) { return 900 };
  if (interval === 1800000) { return 1800 };
  if (interval === 3600000) { return 3600 };
  if (interval === 14400000) { return 14400 };
  if (interval === 86400000) { return 86400 };
  if (interval === 259200000) { return 259200 };
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
  async function private(method, path, query, data) {
    const dataStringified = data ? JSON.stringify(data) : '';
    const queryStrigified = query ? `${qs.stringify(query)}` : '';
    const expiry = Math.round(Date.now() / 1000) + 60;
    const signatureString = `${path}${queryStrigified}${expiry}${dataStringified}`;
    const signature = crypto.createHmac('sha256', restSettings.API_SECRET).update(signatureString).digest('hex');
    const requestSendParams = {
      url: `${restSettings.URL}${path}?${queryStrigified}`,
      data: dataStringified,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'x-phemex-access-token': restSettings.API_KEY,
        'x-phemex-request-expiry': expiry,
        'x-phemex-request-signature': signature,
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
  restSettings.URL = restSettings.URL || 'https://api.phemex.com';
  restSettings.REQUESTS_REFILL = restSettings.REQUESTS_REFILL || false;
  restSettings.REQUESTS_REFILL_LIMIT = restSettings.REQUESTS_REFILL_LIMIT || 40;
  restSettings.REQUESTS_REFILL_AMOUNT = restSettings.REQUESTS_REFILL_AMOUNT || 40;
  restSettings.REQUESTS_REFILL_INTERVAL = restSettings.REQUESTS_REFILL_INTERVAL || 6000;
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
      data.clOrdID = params.id;
      data.side = params.side == 'sell' ? 'Sell' : 'Buy';
      data.orderQty = params.quantity;
      if (params.type == 'limit'){
        data.priceEp = params.price * priceScale;
        data.ordType = 'Limit'
        data.timeInForce = 'GoodTillCancel'
      }
      if (params.type == 'market'){
        data.ordType = 'Market'
        data.timeInForce = 'ImmediateOrCancel'
      }
      if (params.type == 'post-only'){
        data.priceEp = params.price * priceScale;
        data.ordType = 'Limit'
        data.timeInForce = 'PostOnly'
      }
      if (params.type == 'immidiate-or-cancel'){
        data.priceEp = params.price * priceScale;
        data.ordType = 'Limit'
        data.timeInForce = 'ImmediateOrCancel'
      }
      
      const response = await request.private('PUT', '/orders/create', data, '');
      // const response = await request.private('POST', '/orders', '', data);
      if (response.data.code) {
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
      data.symbol = params.symbol;
      data.clOrdID = params.id;
      const response = await request.private('DELETE', '/orders/cancel', data, '');
      if (response.data.code) {
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
      // Get open orders
      const data = {};
      data.symbol = params.symbol;
      const response = await request.private('DELETE', '/orders/all', data, '');
      if (response.data.code) {
        return handleResponseError(params, response.data);
      }
      return { data: params }
    },
    /**
     * 
     * 
     * UPDATE ORDER
     * 
     * 
     */
    updateOrder: async (params) => {

      // Query orderID by clOrdID

      const data ={};
      data.clOrdID = params.id;
      data.symbol = params.symbol;

      let responseOrderID = await request.private('GET', '/exchange/order', data, '');
      if (responseOrderID.data.code) {
        return handleResponseError(params, responseOrderID.data);
      }

      // Retry updateOrder if orderID isn't found on first try but no error is thrown by server

      if (!responseOrderID.data.data || !responseOrderID.data.data.length) { 
        console.log('Empty response query orderID by clOrdID. Update Order Retry.')
        await wait(100);
        responseOrderID = await request.private('GET', '/exchange/order', data, '');
        if (responseOrderID.data.code) {
          return handleResponseError(params, responseOrderID.data);
        }
        if (!responseOrderID.data.data || !responseOrderID.data.data.length) {
          console.log('Empty response on retry. No error code.')
          // Send order not found error if orderID isn't found in retry
          responseOrderID.data.code = 10002;
          return handleResponseError(params, responseOrderID.data);
        }
        console.log('Successful response on retry.')
      }

      data.orderID = responseOrderID.data.data[0].orderID;
      if (params.price) {
        data.priceEp = params.price * priceScale;
      }
      if (params.quantity) {
        data.orderQty = params.quantity;
      }

      let responseOrderUpdate = await request.private('PUT', '/orders/replace', data, '');
      if (responseOrderUpdate.data.code) {
        return handleResponseError(params, responseOrderUpdate.data);
      }
      return { data: params }
    },

    /**
     * 
     * 
     * UPDATE ORDERS
     * 
     * 
     */
    updateOrders: async (params) => Promise.all(params.map(v => rest.updateOrder(v))),
    /**
     * 
     * 
     * GET EQUITY
     * 
     * 
     */
    getEquity: async (params) => {
      const data = {};
      data.currency = params.asset;
      const response = await request.private('GET', '/accounts/positions', data, '');
      if (response.data.code) {
        return handleResponseError(params, response.data.data[0] || response.data);
      }
      // Get pnl for all asset positions
      const unrealised_pnl = response.data.data.positions.map(v => 
        v.unRealisedPnlEv
      ).reduce((a, b) => a + b)
      const equity = (response.data.data.account.accountBalanceEv + unrealised_pnl) / valueScale;
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
      data.symbol = params.symbol;
      data.resolution = getCandleResolution(params.interval);
      data.limit = 1000;
      const response = await request.public('GET', '/exchange/public/md/v2/kline', data);
      if (response.data.code) {
        return handleResponseError(params, response.data.data[0] || response.data);
      }
      const candles = response.data.data.rows.reverse().map(v => {
        const candle = {};
        candle.timestamp = moment(+v[0]*1000).utc().format('YYYY-MM-DD HH:mm:ss');
        candle.open = +v[3] / priceScale;
        candle.high = +v[4] / priceScale;
        candle.low = +v[5] / priceScale;
        candle.close = +v[6] / priceScale;
        candle.volume = +v[7] / priceScale;
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
      switch(params.symbol){
        case 'BTCUSD':
          data.currency = 'BTC';
          break
        case 'ETHUSD':
          data.currency = 'ETH';
          break
        default:
          data.currency = 'USD';
      }
      const response = await request.private('GET', '/accounts/positions', data, '');
      if (response.data.code) {
        return handleResponseError(params, response.data.data[0] || response.data);
      }
      const positionData = response.data.data.positions.find(v => v.symbol === params.symbol);
      const qtyS = positionData && positionData.side == 'Sell' ? Math.abs(+positionData.size) : 0;
      const qtyB = positionData && positionData.side == 'Buy' ? Math.abs(+positionData.size) : 0;
      const pxS = positionData && positionData.side == 'Sell' ? +positionData.avgEntryPriceEp / priceScale : 0;
      const pxB = positionData && positionData.side == 'Buy' ? +positionData.avgEntryPriceEp / priceScale : 0;
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
      const response = await request.public('GET', '/v1/md/ticker/24hr', data);
      if (response.data.code) {
        return handleResponseError(params, response.data.data[0] || response.data);
      }
      const ticker = response.data.result;
      const price = +ticker.lastEp / priceScale;
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
      switch(params.symbol){
        case 'BTCUSD':
          data.currency = 'BTC';
          break
        case 'ETHUSD':
          data.currency = 'ETH';
          break
        default:
          data.currency = 'USD';
      }
      const response = await request.private('GET', '/accounts/positions', data, '');
      if (response.data.code) {
        return handleResponseError(params, response.data.data[0] || response.data);
      }
      const positionData = response.data.data.positions.find(v => v.symbol === params.symbol);
      // Calculate liquidation
      const markPx = +positionData.markPriceEp / priceScale;
      const liqPxS = positionData && positionData.side == 'Sell' ? +positionData.liquidationPriceEp / priceScale : 0;
      const liqPxB = positionData && positionData.side == 'Buy' ? +positionData.liquidationPriceEp / priceScale : 0;
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
      const response = await request.public('GET', '/v1/md/ticker/24hr', data);
      if (response.data.code) {
        return handleResponseError(params, response.data.data[0] || response.data);
      }
      const ticker = response.data.result;
      const current = +ticker.fundingRateEr / ratioScale;
      const estimated = +ticker.predFundingRateEr / ratioScale;
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
      const response = await request.public('GET', '/public/products', data);
      if (response.data.code) {
        return handleResponseError(response.data.data[0] || response.data);
      }
      const symbols = response.data.data.products;
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
      data.symbol = params.symbol;
      const response = await request.public('GET', '/md/orderbook', data);
      if (response.data.code) {
        return handleResponseError(params, response.data.data[0] || response.data);
      }

      const orderbook = response.data.result.book;
      
      const asks = orderbook.asks.map(ask => {
        return { id: +ask[0] / priceScale, price: +ask[0] / priceScale, quantity: +ask[1] };
      });
      const bids = orderbook.bids.map(bid => {
        return { id: +bid[0] / priceScale, price: +bid[0] / priceScale, quantity: +bid[1] };
      });
      const lastUpdateId = +response.data.result.timestamp;
      return { data: { asks, bids, lastUpdateId } };
    },
  };
  return rest;
};
module.exports = Rest;
