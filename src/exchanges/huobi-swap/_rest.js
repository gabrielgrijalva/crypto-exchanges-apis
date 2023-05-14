const Flatted = require('flatted');
const qs = require('qs');
const crypto = require('crypto');
const moment = require('moment');
const Request = require('../../_shared-classes/request');
const wait = require('../../_utils/wait');

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
  if (responseData.err_code) {
    const errorCode = (responseData.err_code).toString();
    switch (errorCode)
    {
      case '1032':
        type = 'api-rate-limit'
        break;
      case '1000':
      case '1001':
      case '1002':
      case '1003':
      case '1004':
      case '1046':
      case '1056':
      case '1057':
      case '1058':
      case '1059':
      case '1060':
      case '1077':
      case '1078':
      case '1079':
      case '1080':
      case '1108':
        type = 'no-function';
        break;
      case '1017':
      case '1051':
      case '1061':
      case '1063':
      case '1071':
        type = 'order-not-found';
        break;
      case '0':
        type = 'post-only-reject';
        break;
      case '1047':
      case '1048':
      case '1090':
      case '1091':
      case '1221':
        type = 'insufficient-funds';
        break;
      case '1030':
      case '1031':
      case '1032':
      case '1033':
      case '1034':
      case '1035':
      case '1036':
      case '1038':
      case '1039':
      case '1040':
      case '1052':
      case '1066':
        type = 'request-not-accepted';
        break; 
      case '0':
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
  if (interval === 60000) { return '1min' };
  if (interval === 300000) { return '5min' };
  if (interval === 900000) { return '15min' };
  if (interval === 1800000) { return '30min' };
  if (interval === 3600000) { return '1hour' };
  if (interval === 14400000) { return '4hour' };
  if (interval === 86400000) { return '1day' };
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
  async function public(method, path, data, requestConsumption = 1) {
    const dataStringified = qs.stringify(data);
    const requestSendParams = {
      url: `${restSettings.URL}${path}?${dataStringified}`,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
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
  async function private(method, path, data, requestConsumption = 1) {

    const dataStringified = data ? JSON.stringify(data) : '';

    let signatureParams = {
      AccessKeyId: restSettings.API_KEY,
      SignatureMethod: 'HmacSHA256',
      SignatureVersion: '2',
      Timestamp: moment.utc().format('YYYY-MM-DDTHH:mm:ss')
    }
    const signatureParamsStringified = qs.stringify(signatureParams);
    const strippedUrl = restSettings.URL.includes('https://') ? restSettings.URL.replace("https://", "") : restSettings.URL.replace("http://", "")
    const stringToSign = `${method}\n${strippedUrl}\n${path}\n${signatureParamsStringified}`;
    const signature = crypto.createHmac('sha256', restSettings.API_SECRET).update(stringToSign).digest('base64');
    signatureParams.Signature = signature;
    
    const signedParams = qs.stringify(signatureParams);

    const requestSendParams = {
      url: `${restSettings.URL}${path}?${signedParams}`,
      data: dataStringified,
      method: method,
      headers: {
        'Content-Type': 'application/json',
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
  restSettings.URL = restSettings.URL || 'https://api.hbdm.vn';
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
      data.client_order_id = params.id;
      data.contract_code = params.symbol;
      data.direction = params.side;
      data.offset = params.direction;
      data.volume = params.quantity;
      data.lever_rate = 10;
      if (params.type == 'limit'){
        data.price = params.price;
        data.order_price_type = 'limit'
      }
      if (params.type == 'market'){
        data.order_price_type = 'optimal_20_ioc'
      }
      if (params.type == 'post-only'){
        data.price = params.price;
        data.order_price_type = 'post_only'
      }
      if (params.type == 'immidiate-or-cancel'){
        data.price = params.price;
        data.order_price_type = 'ioc'
      }
      let start = process.hrtime();
      const response = await request.private('POST', '/swap-api/v1/swap_order', data, 1);
      let end = process.hrtime(start);
      console.log(`Create orderId: ${data.client_order_id}, RTT: ${hrtimeToMilliseconds(end)} ms`)
      if (response && response.data && response.data.err_code) {
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
      data.contract_code = params.symbol;
      data.client_order_id = params.id;
      let start = process.hrtime();
      const response = await request.private('POST', '/swap-api/v1/swap_cancel', data, 1);
      let end = process.hrtime(start);
      console.log(`Cancel orderId: ${data.client_order_id}, RTT: ${hrtimeToMilliseconds(end)} ms`)
      if (response && response.data && (response.data.err_code || (response.data.data.errors && response.data.data.errors.length))) {
        if (response.data.data && response.data.data.errors && response.data.data.errors.length){
          response.data.data.errors.forEach(err => {
            return handleResponseError(params, err, 'cancelOrder 1');
          })
        }
        else {
          return handleResponseError(params, response.data, 'cancelOrder 2');
        } 
      }
      let successes = response.data.data.successes ? response.data.data.successes.split(',') : [];
      return { data: { successes } };
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
      data.contract_code = params.symbol;
      let start = process.hrtime();
      const response = await request.private('POST', '/swap-api/v1/swap_cancelall', data, 1);
      let end = process.hrtime(start);
      console.log(`Cancel orders all, RTT: ${hrtimeToMilliseconds(end)} ms`)
      
      if (response && response.data && (response.data.err_code || (response.data.data.errors && response.data.data.errors.length))) {
        if (response.data.data && response.data.data.errors && response.data.data.errors.length){
          response.data.data.errors.forEach(err => {
            return handleResponseError(params, err, 'cancelOrdersAll 1');
          })
        }
        else {
          return handleResponseError(params, response.data, 'cancelOrdersAll 2');
        } 
      }
      let successes = response.data.data.successes ? response.data.data.successes.split(',') : [];
      return { data: { successes } };
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
      const response = await request.private('POST', '/swap-api/v1/swap_account_info', data, 1);
      if (response && response.data && response.data.err_code) {
        return handleResponseError(params, response.data, 'getEquity');
      }
      const equity = response.data.data.filter(v => v.symbol === params.asset)[0]['margin_balance'];
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
      data.contract_code = params.symbol;
      data.period = getCandleResolution(params.interval);
      data.from = moment.utc(params.start).unix();
      data.to = moment.utc(params.start).add(1500 * params.interval, 'milliseconds').unix();
      data.to = data.to < timestamp ? data.to : timestamp;
      const response = await request.public('GET', '/swap-ex/market/history/kline', data, 10);
      if (response && response.data && response.data.err_code) {
        return handleResponseError(params, response.data, 'getCandles');
      }
      const candles = response.data.data.map(v => {
        const candle = {};
        candle.timestamp = moment(+v.id*1000).utc().format('YYYY-MM-DD HH:mm:ss');
        candle.open = +v.open;
        candle.high = +v.high;
        candle.low = +v.low;
        candle.close = +v.close;
        candle.volume = +v.vol;
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
      data.contract_code = data.symbol;
      const response = await request.private('POST', '/swap-api/v1/swap_position_info', data, 1);
      if (response && response.data && response.data.err_code ) {
        return handleResponseError(params, response.data, 'getPosition');
      }
      const positionData = response.data.data.filter(v => v.contract_code === params.symbol);
      let qtyS = 0;
      let qtyB = 0;
      let pxS = 0;
      let pxB = 0;
      positionData.forEach(positionEvent => {
        if(positionEvent.direction == 'buy'){
          pxB = +positionEvent.cost_open;
          qtyB = Math.abs(+positionEvent.volume);
        }
        if(positionEvent.direction == 'sell'){
          pxS = +positionEvent.cost_open;
          qtyS = Math.abs(+positionEvent.volume);
        }
      });
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
      data.contract_code = params.symbol;
      const response = await request.public('GET', '/swap-ex/market/trade', data);
      if (response && response.data && response.data.err_code) {
        return handleResponseError(params, response.data, 'getLastPrice 1');
      }
      if (!response || !response.data || !response.data.tick || !response.data.tick.data.length ) {
        return handleResponseError(params, response.data, 'getLastPrice 2');
      }
      const price = response.data.tick.data[0].price;
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
      data.contract_code = params.symbol;
      const responsePosition = await request.private('POST', '/swap-api/v1/swap_account_position_info', data, 1);
      if (responsePosition && responsePosition.data && responsePosition.data.err_code) {
        return handleResponseError(params, responsePosition.data, 'getLiquidation 1');
      }
      const positionData = responsePosition.data.data.filter(v => v.contract_code === params.symbol)[0];

      data.size = 1;
      data.period = '1min';
      const responseMarkPrice = await request.public('GET', '/index/market/history/swap_mark_price_kline', data);
      if (responseMarkPrice && responseMarkPrice.data && responseMarkPrice.data.err_code) {
        return handleResponseError(params, responseMarkPrice.data, 'getLiquidation 2');
      }

      const liqPx = +positionData.liquidation_price;
      const markPx = responseMarkPrice.data.data.length ? responseMarkPrice.data.data[0].close : 0;
      let liqPxS = 0;
      let liqPxB = 0;

      const shortPosition = positionData.positions.find(v => v.direction == 'sell' && v.volume);
      const longPosition = positionData.positions.find(v => v.direction == 'buy' && v.volume);

      if (longPosition && shortPosition){
        liqPxB = markPx < liqPx ? 0 : liqPx;
        liqPxS = markPx > liqPx ? 0 : liqPx;
      } else {
        liqPxB = longPosition ? liqPx : 0;
        liqPxS = shortPosition ? liqPx : 0;
      }

      // Calculate liquidation
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
      data.contract_code = params.symbol;
      const response = await request.public('GET', '/swap-api/v1/swap_funding_rate', data);
      if (response && response.data && response.data.err_code) {
        return handleResponseError(params, response.data, 'getFundingRates');
      }
      const current = +response.data.data.funding_rate;
      const estimated = +response.data.data.estimated_rate;
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
      const response = await request.public('GET', '/swap-api/v1/swap_contract_info', data);
      if (response && response.data && response.data.err_code) {
        return handleResponseError(null, response.data, 'getInstrumentsSymbols');
      }
      const symbols = response.data.data;
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
      data.contract_code = params.symbol;
      data.type = 'step0'
      const response = await request.public('GET', '/swap-ex/market/depth', data);
      if (response && response.data && response.data.err_code) {
        return handleResponseError(null, response.data, '');
      }

      const orderbook = response.data.tick;
      
      const asks = orderbook.asks.map(ask => {
        return { id: +ask[0], price: +ask[0], quantity: +ask[1] };
      });
      const bids = orderbook.bids.map(bid => {
        return { id: +bid[0], price: +bid[0], quantity: +bid[1] };
      });
      const lastUpdateId = +response.data.tick.ts;
      return { data: { asks, bids, lastUpdateId } };
    },
    /**
     * 
     * 
     * ACTIVATE SUB ACCOUNT
     * 
     * 
     */
    _activateSubAccount: async (params) => {
      const data = {};
      data.sub_uid = params.uid;
      data.sub_auth = params.auth;
      const response = await request.private('POST', '/swap-api/v1/swap_sub_auth', data, 1);
      if (response && response.data && response.data.err_code) {
        return handleResponseError(params, response.data, '_activateSubAccount');
      }
      return { data: { errors: response.data.errors, successes: response.data.errors } }
    },
  };
  return rest;
};
module.exports = Rest;
