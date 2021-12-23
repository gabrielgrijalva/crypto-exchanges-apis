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
 * @param {RestN.params | null} params
 * @param {Object | string} responseData 
 * @returns {{ error: RestN.RestErrorResponseData }}
 */
function handleResponseError(params, responseData) {
  /** @type {RestN.restErrorResponseDataType} */
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
 * @this {RestN.Request} 
 * @returns {Promise<RestN.requestSendReturn>}
 */
async function public(method, path, data) {
  const dataStringified = qs.stringify(data);
  const requestSendParams = {
    url: `${this.restOptions.url}${path}?${dataStringified}`,
    method: method,
  };
  console.log(requestSendParams);
  const response = await this.send(requestSendParams);
  console.log(response);
  return response;
};
/** 
 * @this {RestN.Request} 
 * @returns {Promise<RestN.requestSendReturn>}
 */
async function key(method, path, data) {
  const dataStringified = qs.stringify(data);
  const requestSendParams = {
    url: `${this.restOptions.url}${path}?${dataStringified}`,
    method: method,
    headers: { 'X-MBX-APIKEY': this.restOptions.apiKey },
  };
  console.log(requestSendParams);
  const response = await this.send(requestSendParams);
  console.log(response);
  return response;
};
/** 
 * @this {RestN.Request} 
 * @returns {Promise<RestN.requestSendReturn>}
 */
async function private(method, path, data) {
  const privateData = {};
  privateData.timestamp = Date.now() - 500;
  privateData.recWindow = this.restOptions.apiKey;
  const preSignatureData = Object.assign(data, privateData);
  const signature = crypto.createHmac('sha256', this.restOptions.apiSecret)
    .update(qs.stringify(preSignatureData)).digest('hex');
  const dataSignature = Object.assign(preSignatureData, { signature });
  const dataStringified = qs.stringify(dataSignature);
  const requestSendParams = {
    url: `${this.restOptions.url}${path}?${dataStringified}`,
    method: method,
    headers: { 'X-MBX-APIKEY': this.restOptions.apiKey },
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
 * @param {RestN.restOptions} [restOptions] 
 */
function Rest(restOptions) {
  // Default restOptions values
  restOptions = restOptions || {};
  restOptions.url = restOptions.url || 'https://dapi.binance.com';
  restOptions.apiKey = restOptions.apiKey || '';
  restOptions.apiSecret = restOptions.apiSecret || '';
  restOptions.apiPassphrase = restOptions.apiPassphrase || '';
  restOptions.requestsLimit = restOptions.requestsLimit || 1200;
  restOptions.requestsTimestamps = restOptions.requestsTimestamps || 10;
  restOptions.requestsRefill = restOptions.requestsRefill || 0;
  restOptions.requestsRefillType = restOptions.requestsRefillType || '';
  restOptions.requestsRefillInterval = restOptions.requestsRefillInterval || 0;
  // Request creation
  const request = Request({ restOptions, public, key, private });
  /** 
   * 
   * 
   * @type {RestN.Rest} 
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
      data.side = params.side.toUpperCase();
      data.type = params.type.toUpperCase();
      data.symbol = params.symbol;
      data.quantity = `${params.quantity}`;
      data.newClientOrderId = params.id;
      if (params.type === 'limit') {
        data.price = `${params.price}`;
        data.timeInForce = 'GTX';
      }
      const response = await request.private('POST', '/dapi/v1/order', data);
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
    createOrders: async (params) => {
      const data = {};
      data.batchOrders = `[${params.reduce((a, v) => {
        const orderData = {};
        orderData.side = v.side.toUpperCase();
        orderData.type = v.type.toUpperCase();
        orderData.symbol = v.symbol;
        orderData.quantity = `${v.quantity}`;
        orderData.newClientOrderId = v.id;
        if (v.type === 'limit') {
          orderData.price = `${v.price}`;
          orderData.timeInForce = 'GTX';
        }
        return `${!a ? '' : `${a},`}${JSON.stringify(orderData)}`;
      }, '')}]`;
      const response = await request.private('POST', '/dapi/v1/batchOrders', data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data);
      }
      return response.data.map((v, i) => {
        if (v.code && v.code < 0) {
          return handleResponseError(params[i], v);
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
      data.symbol = params.symbol;
      data.origClientOrderId = params.id;
      const response = await request.private('DELETE', '/dapi/v1/order', data);
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
      data.symbol = params[0].symbol;
      data.origClientOrderIdList = `[${params.reduce((a, v) => `${!a ? '' : `${a},`}"${v.id}"`, '')}]`;
      const response = await request.private('DELETE', '/dapi/v1/batchOrders', data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data);
      }
      return response.data.map((v, i) => {
        if (v.code && v.code < 0) {
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
      const response = await request.private('DELETE', '/dapi/v1/allOpenOrders', data);
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
    // updateOrder: (params) => {}
    /**
     * 
     * 
     * UPDATE ORDERS
     * 
     * 
     */
    // updateOrders: (params) => {}
    /**
     * 
     * 
     * GET EQUITY
     * 
     * 
     */
    getEquity: async (params) => {
      const data = {};
      const response = await request.private('GET', '/dapi/v1/account', data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data);
      }
      const equity = +response.data.assets.find(v => v.asset
        === params.asset).marginBalance;
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
      data.limit = 1500;
      const response = await request.public('GET', '/dapi/v1/klines', data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data);
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
      const response = await request.private('GET', '/dapi/v1/positionRisk', data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data);
      }
      const positionData = response.data.find(v => v.symbol === params.symbol);
      const qtyS = +positionData.positionAmt < 0 ? Math.abs(+positionData.positionAmt) : 0;
      const qtyB = +positionData.positionAmt > 0 ? Math.abs(+positionData.positionAmt) : 0;
      const pxS = qtyS ? +positionData.entryPrice : 0;
      const pxB = qtyB ? +positionData.entryPrice : 0;
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
      const response = await request.public('GET', '/dapi/v1/trades', data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data);
      }
      const price = +response.data[response.data.length - 1].price;
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
      // Get premium index 
      const premiumIndexData = {};
      premiumIndexData.symbol = params.symbol;
      const premiumIndexResponse = await request.public('GET', '/dapi/v1/premiumIndex', premiumIndexData);
      if (premiumIndexResponse.status >= 400) {
        return handleResponseError(params, premiumIndexResponse.data);
      }
      // Get position
      const positionData = {};
      const positionResponse = await request.private('GET', '/dapi/v1/positionRisk', positionData);
      if (positionResponse.status >= 400) {
        return handleResponseError(params, positionResponse.data);
      }
      // Calculate liquidation
      const position = positionResponse.data.find(v => v.symbol === params.symbol);
      const markPx = +premiumIndexResponse.data[0].markPrice;
      const liqPxS = +position.positionAmt < 0 ? +position.liquidationPrice : 0;
      const liqPxB = +position.positionAmt > 0 ? +position.liquidationPrice : 0;
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
      const response = await request.public('GET', '/dapi/v1/premiumIndex', data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data);
      }
      const responseData = response.data[0];
      const current = responseData ? +responseData.lastFundingRate : 0;
      const estimated = responseData ? +responseData.lastFundingRate : 0;
      const fundings = { current, estimated, };
      return { data: fundings };
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
      const response = await request.private('POST', '/dapi/v1/listenKey', data);
      if (response.status >= 400) {
        return handleResponseError(null, response.data);
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
      const response = await request.public('GET', '/dapi/v1/depth', data);
      if (response.status >= 400) {
        return handleResponseError(params, response.data);
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
