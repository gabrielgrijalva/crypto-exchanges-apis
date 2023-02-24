const Flatted = require('flatted');
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
 * @param {string} callingFunction
 * @returns {{ error: import('../../../typings/_rest').RestErrorResponseData<any> }}
 */
function handleResponseError(params, responseData, callingFunction) {
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
  async function public(method, path, data, requestConsumption = 1) {
    const dataStringified = qs.stringify(data);
    const requestSendParams = {
      url: `${restSettings.URL}${path}?${dataStringified}`,
      method: method,
      requestConsumption
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
  async function private(method, path, query, data, requestConsumption = 1) {
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
  restSettings.URL = restSettings.URL || 'https://api.phemex.com';
  restSettings.REQUESTS_REFILL = restSettings.REQUESTS_REFILL || false;
  restSettings.REQUESTS_REFILL_LIMIT = restSettings.REQUESTS_REFILL_LIMIT || 500;
  restSettings.REQUESTS_REFILL_AMOUNT = restSettings.REQUESTS_REFILL_AMOUNT || 500;
  restSettings.REQUESTS_REFILL_INTERVAL = restSettings.REQUESTS_REFILL_INTERVAL || 60000;
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
      console.log('Creating order:', params)
      const data = {};
      data.symbol = params.symbol;
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
      const response = await request.private('PUT', '/orders/create', data, '', 1);
      
      if (response.data.code) {
        if (response.data && response.data.data && response.data.data[0]){
          return handleResponseError(params, response.data.data[0], 'createOrder 1')
        }
        if (response.data){
          return handleResponseError(params, response.data, 'createOrder 2')
        }
      }

      params.id = response.data.data.orderID
      
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
      data.orderID = params.id;
      const response = await request.private('DELETE', '/orders/cancel', data, '', 1);
      
      if (response.data.code) {
        if (response.data && response.data.data && response.data.data[0]){
          return handleResponseError(params, response.data.data[0], 'cancelOrder 1')
        }
        if (response.data){
          return handleResponseError(params, response.data, 'cancelOrder 2')
        }
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
      const response = await request.private('DELETE', '/orders/all', data, '', 3);
      
      if (response.data.code) {
        if (response.data && response.data.data && response.data.data[0]){
          return handleResponseError(params, response.data.data[0], 'cancelOrdersAll 1')
        }
        if (response.data){
          return handleResponseError(params, response.data, 'cancelOrdersAll 2')
        }
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

      const data ={};
      data.orderID = params.id;
      data.symbol = params.symbol;

      if (params.price) {
        data.priceEp = params.price * priceScale;
      }
      if (params.quantity) {
        data.orderQty = params.quantity;
      }

      const response = await request.private('PUT', '/orders/replace', data, '', 1);

      if (response.data.code) {
        if (response.data && response.data.data && response.data.data[0]){
          return handleResponseError(params, response.data.data[0], 'updateOrder 1')
        }
        if (response.data){
          return handleResponseError(params, response.data, 'updateOrder 2')
        }
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
      const response = await request.private('GET', '/accounts/positions', data, '', 25);
      
      if (response.data.code) {
        if (response.data && response.data.data && response.data.data[0]){
          return handleResponseError(params, response.data.data[0], 'getEquity 1')
        }
        if (response.data){
          return handleResponseError(params, response.data, 'getEquity 2')
        }
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
      let response = await request.public('GET', '/exchange/public/md/v2/kline', data, 10);
      
      if (response.data.code) {
        if (response.data && response.data.data && response.data.data[0]){
          return handleResponseError(params, response.data.data[0], 'getCandles 1')
        }
        if (response.data){
          return handleResponseError(params, response.data, 'getCandles 2')
        }
      }

      if (!response.data.data || !response.data.data || !response.data.data.rows) { 

        console.log('Empty response query candles.')

        let retryCount = 0;

        while(retryCount < 15){
          retryCount++;
          console.log(`Query query candles Retry (${retryCount}).`)
          await wait(1000);
          response = await request.public('GET', '/exchange/public/md/v2/kline', data, 10);
          
          if (response.data.code) {
            if (response.data && response.data.data && response.data.data[0]){
              return handleResponseError(params, response.data.data[0], 'getCandles 3')
            }
            if (response.data){
              return handleResponseError(params, response.data, 'getCandles 4')
            }
          }
          
          if (response.data.data && response.data.data.length && response.data.data.rows){
            break;
          }
        }

        if (!response.data.data || !response.data.data.length || !response.data.data.rows) {
          console.log('Empty response on retry. No error code.')
          // Send order not found error if orderID isn't found in retry
          response.data.code = 10002;
          if (response.data && response.data.data && response.data.data[0]){
            return handleResponseError(params, response.data.data[0], 'getCandles 5')
          }
          if (response.data){
            return handleResponseError(params, response.data, 'getCandles 6')
          }
        }

        console.log('Successful response on retry.')

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
      const response = await request.private('GET', '/accounts/positions', data, '', 25);
      
      if (response.data.code) {
        if (response.data && response.data.data && response.data.data[0]){
          return handleResponseError(params, response.data.data[0], 'getPosition 1')
        }
        if (response.data){
          return handleResponseError(params, response.data, 'getPosition 2')
        }
      }

      if (!response || !response.data || !response.data.data || !response.data.data.positions) { return };
      
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
        if (response.data && response.data.data && response.data.data[0]){
          return handleResponseError(params, response.data.data[0], 'getLastPrice 1')
        }
        if (response.data){
          return handleResponseError(params, response.data, 'getLastPrice 2')
        }
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
      data.currency = params.asset;
      const response = await request.private('GET', '/accounts/positions', data, '', 25);
      
      if (response.data.code) {
        if (response.data && response.data.data && response.data.data[0]){
          return handleResponseError(params, response.data.data[0], 'getLiquidation 1')
        }
        if (response.data){
          return handleResponseError(params, response.data, 'getLiquidation 2')
        }
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
        if (response.data && response.data.data && response.data.data[0]){
          return handleResponseError(params, response.data.data[0], 'getFundingRates 1')
        }
        if (response.data){
          return handleResponseError(params, response.data, 'getFundingRates 2')
        }
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
        if (response.data && response.data.data && response.data.data[0]){
          return handleResponseError(null, response.data.data[0], 'getInstrumentsSymbols 1')
        }
        if (response.data){
          return handleResponseError(null, response.data, 'getInstrumentsSymbols 2')
        }
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
        if (response.data && response.data.data && response.data.data[0]){
          return handleResponseError(params, response.data.data[0], '_getOrderBook 1')
        }
        if (response.data){
          return handleResponseError(params, response.data, '_getOrderBook 2')
        }
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
