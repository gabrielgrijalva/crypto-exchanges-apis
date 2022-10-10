const wait = require('../_utils/wait');
const round = require('../_utils/round');
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
 * 
 * @param {string} symbol
 * @param {import('../../typings/_rest').Rest} rest 
 */
async function sendRestGetPosition(symbol, rest, errors = 0) {
  const response = await rest.getPosition({ symbol });
  if (response.error) {
    if (errors >= 10) { throw response.error };
    if (response.error.type === 'request-timeout'
      || response.error.type === 'request-not-accepted') {
      return sendRestGetPosition(symbol, rest, errors + 1);
    }
    throw response.error;
  };
  return response.data;
};
/**
 * 
 * @param {import('../../typings/_rest').Rest} rest 
 */
async function sendRestCreateOrder(rest, params, errors = 0) {
  const response = await rest.createOrder(params);
  if (response.error) {
    if (errors >= 10) { throw response.error };
    if (response.error.type === 'request-timeout'
      || response.error.type === 'request-not-accepted') {
      return sendRestCreateOrder(rest, params, errors + 1);
    }
    throw response.error;
  };
  return response.data;
};
/**
 * 
 * @param {import('../../typings/_rest').Rest} rest 
 */
async function sendRestUpdateOrder(rest, params, errors = 0) {
  const response = await rest.updateOrder(params);
  if (response.error) {
    if (errors >= 10) { throw response.error };
    if (response.error.type === 'request-timeout'
      || response.error.type === 'request-not-accepted') {
      return sendRestUpdateOrder(rest, params, errors + 1);
    }
    throw response.error;
  };
  return response.data;
};
/**
 * 
 * @param {import('../../typings/_rest').Rest} rest 
 */
async function sendRestCancelOrder(rest, params, errors = 0) {
  const response = await rest.cancelOrder(params);
  if (response.error) {
    if (errors >= 10) { throw response.error };
    if (response.error.type === 'request-timeout'
      || response.error.type === 'request-not-accepted') {
      return sendRestCancelOrder(rest, params, errors + 1);
    }
    throw response.error;
  };
  return response.data;
};
/**
 * 
 * @param {number} hedgePercentage
 * @param {string} fixSymbol
 * @param {number} fixPositionQtyS 
 * @param {number} fixPositionQtyB
 * @param {'market' | 'post-only'} fixPositionType 
 * @param {number} currentPositionQtyS 
 * @param {number} currentPositionQtyB 
 * @param {import('../../typings/_ws').Ws} ws
 * @param {import('../../typings/_utils').Utils} utils 
 * @param {import('../../typings/_fixer').fixerSettings} fixerSettings
 * @returns {import('../../typings/_rest').createOrderParams}
 */
function getFixOrderCreate(hedgePercentage, fixSymbol, fixPositionQtyS, fixPositionQtyB, fixPositionType, currentPositionQtyS, currentPositionQtyB, ws, utils, fixerSettings) {
  /** @type {'sell' | 'buy'} */
  let side = 'sell';
  /** @type {number} */
  let quantity = 0;
  /** @type {'open' | 'close'} */
  let direction = 'open';
  const type = fixerSettings.TYPE;
  if (!ws || !ws.orderBooks || !ws.orderBooks.data || !ws.orderBooks.data[0].asks || !ws.orderBooks.data[0].bids) { return }
  const bestAsk = ws.orderBooks.data[0].asks[0].price;
  const bestBid = ws.orderBooks.data[0].bids[0].price;
  // OPEN SELL
  if (fixPositionQtyS > currentPositionQtyS) {
    side = 'sell';
    quantity = round.normal(((fixPositionQtyS - currentPositionQtyS) / (type === 'spot' ? bestAsk : 1)) * hedgePercentage, fixerSettings.QUANTITY_PRECISION);
    direction = 'open';
  }
  // CLOSE SELL
  if (fixPositionQtyS < currentPositionQtyS) {
    side = 'buy';
    quantity = round.normal(((currentPositionQtyS - fixPositionQtyS) / (type === 'spot' ? bestBid : 1)) * hedgePercentage, fixerSettings.QUANTITY_PRECISION);
    direction = 'close';
  }
  // OPEN BUY
  if (fixPositionQtyB > currentPositionQtyB) {
    side = 'buy';
    quantity = round.normal((fixPositionQtyB - currentPositionQtyB) * hedgePercentage, fixerSettings.QUANTITY_PRECISION);
    direction = 'open';
  }
  // CLOSE BUY
  if (fixPositionQtyB < currentPositionQtyB) {
    side = 'sell';
    quantity = round.normal((currentPositionQtyB - fixPositionQtyB) * hedgePercentage, fixerSettings.QUANTITY_PRECISION);
    direction = 'close';
  }
  if (!quantity) { return };
  // HANDLE MIN QUANTITY
  if (quantity < fixerSettings.QUANTITY_MIN) {
    side = direction === 'open' ? side : (side === 'sell' ? 'buy' : 'sell');
    quantity = round.normal(quantity + fixerSettings.QUANTITY_MIN, fixerSettings.QUANTITY_PRECISION);
    direction = 'open';
  };
  const orderParams = {};
  orderParams.id = utils.getOrderId(fixSymbol);
  orderParams.side = side;
  orderParams.type = fixPositionType;
  if (orderParams.type === 'post-only') {
    orderParams.price = orderParams.side === 'sell' ? bestAsk : bestBid;
  }
  orderParams.symbol = fixSymbol;
  orderParams.quantity = quantity;
  orderParams.direction = direction;
  return orderParams;
};
/**
 * 
 * @param {import('../../typings/_ws').Ws} ws
 * @param {import('../../typings/_rest').createOrderParams} order 
 * @param {import('../../typings/_fixer').fixerSettings} fixerSettings
 * @returns {import('../../typings/_rest').updateOrderParams}
 */
function getFixOrderUpdate(ws, order, fixerSettings) {
  const side = order.side;
  const price = order.side === 'sell' ? ws.orderBooks.data[0].asks[0].price : ws.orderBooks.data[0].bids[0].price;
  const quantity = fixerSettings.TYPE === 'spot' && order.side === 'buy' ?
    round.down((order.price * order.quantity) / price, fixerSettings.QUANTITY_PRECISION) : order.quantity;
  return { id: order.id, side: side, price: price, symbol: order.symbol, quantity: quantity };
};
/**
 * 
 * @param {import('../../typings/_rest').createOrderParams} order 
 * @returns {import('../../typings/_rest').cancelOrderParams}
 */
function getFixOrderCancel(order) {
  return { id: order.id, symbol: order.symbol };
};
/**
 * 
 * @param {number} fixPositionQtyS 
 * @param {number} fixPositionQtyB
 * @param {number} currentPositionQtyS 
 * @param {number} currentPositionQtyB 
 * @param {import('../../typings/_fixer').fixerSettings} fixerSettings
 * @returns {boolean}
 */
function shouldCreateFixOrder(fixPositionQtyS, fixPositionQtyB, currentPositionQtyS, currentPositionQtyB, fixerSettings) {
  if (fixPositionQtyS === currentPositionQtyS && fixPositionQtyB === currentPositionQtyB) {
    return false;
  }
  if (fixerSettings.TYPE === 'spot'
    && (Math.abs(fixPositionQtyS - currentPositionQtyS) < fixerSettings.QUANTITY_MIN)
    && (Math.abs(fixPositionQtyB - currentPositionQtyB) < fixerSettings.QUANTITY_MIN)) {
    return false;
  }
  return true;
}
/**
 * 
 * 
 * 
 * =================================
 * POPULATOR DEFINITION
 * =================================
 * 
 * 
 * 
 */
/** 
 * @param {import('../../typings/_fixer').fixerSettings} fixerSettings
 */
function Fixer(fixerSettings) {
  /**
   * 
   * 
   * @type {import('../../typings/_fixer').Fixer}
   * 
   * 
   */
  const fixer = {
    /**
     * 
     * 
     * 
     * FIXER EXECUTE
     * 
     * 
     * 
     */
    execute: (params) => {
      const ws = params.ws;
      const rest = params.rest;
      const utils = params.utils;
      const fixSymbol = params.fixSymbol;
      const fixPositionType = params.fixPositionType;
      const fixPositionQtyS = params.fixPositionQtyS;
      const fixPositionQtyB = params.fixPositionQtyB;
      return new Promise(async resolve => {
        const currentPosition = await sendRestGetPosition(fixSymbol, rest);
        /** @type {import('../../typings/_rest').createOrderParams} */
        let order = null;
        /** @type {import('../../typings/_rest').createOrderParams} */
        let creating = null;
        /** @type {import('../../typings/_rest').updateOrderParams} */
        let updating = null;
        /** @type {import('../../typings/_rest').cancelOrderParams} */
        let canceling = null;
        let orderQtyF = 0;
        let hedgePercentage = 1;
        let creatingTimeout = null;
        let updatingTimeout = null;
        let cancelingTimeout = null;
        let creatingHoldEvents = [];
        let currentPositionQtyS = currentPosition.qtyS;
        let currentPositionQtyB = currentPosition.qtyB;
        const creationsUpdatesFunc = (messages) => {
          console.log('creations-updates'); console.log(messages);
          messages.forEach(message => {
            if (message.symbol !== fixSymbol) { return };
            if (creating && creating.id === message.id) {
              order = creating;
              creating = null;
              clearTimeout(creatingTimeout);
            }
            else if (updating && updating.id === message.id) {
              order.price = message.price;
              order.quantity = message.quantity;
              updating = null;
              clearTimeout(updatingTimeout);
            }
            else if (creating && !creating.id) {
              creatingHoldEvents.push(message);
            }
          });
        };
        ws.orders.events.on('creations-updates', creationsUpdatesFunc);
        const executionsFunc = (messages) => {
          console.log('executions'); console.log(messages);
          messages.forEach(message => {
            if (message.symbol !== fixSymbol) { return };
            if (creating && creating.id === message.id) {
              order = creating;
              creating = null;
              clearTimeout(creatingTimeout);
            }
            if (message.id === order.id) {
              orderQtyF = round.normal(orderQtyF + message.quantity, fixerSettings.QUANTITY_PRECISION);
              if (order.direction === 'open') {
                if (order.side === 'sell') {
                  currentPositionQtyS = round.normal(currentPositionQtyS + message.quantity, fixerSettings.QUANTITY_PRECISION);
                }
                if (order.side === 'buy') {
                  currentPositionQtyB = round.normal(currentPositionQtyB + message.quantity, fixerSettings.QUANTITY_PRECISION);
                }
              }
              if (order.direction === 'close') {
                if (order.side === 'sell') {
                  currentPositionQtyB = round.normal(currentPositionQtyB - message.quantity, fixerSettings.QUANTITY_PRECISION);
                }
                if (order.side === 'buy') {
                  currentPositionQtyS = round.normal(currentPositionQtyS - message.quantity, fixerSettings.QUANTITY_PRECISION);
                }
              }
            }
            if (orderQtyF >= order.quantity) {
              order = null;
              orderQtyF = 0;
              creating = null;
              updating = null;
              canceling = null;
              clearTimeout(creatingTimeout);
              clearTimeout(updatingTimeout);
              clearTimeout(cancelingTimeout);
            }
          });
        };
        ws.orders.events.on('executions', executionsFunc);
        const cancelationsFunc = (messages) => {
          console.log('cancelations'); console.log(messages);
          messages.forEach(message => {
            if (message.symbol !== fixSymbol) { return };
            if ((order && message.id === order.id)
              || (creating && message.id === creating.id)
              || (updating && message.id === updating.id)
              || (canceling && message.id === canceling.id)) {
              order = null;
              orderQtyF = 0;
              creating = null;
              updating = null;
              canceling = null;
              clearTimeout(creatingTimeout);
              clearTimeout(updatingTimeout);
              clearTimeout(cancelingTimeout);
            }
          });
        };
        ws.orders.events.on('cancelations', cancelationsFunc);
        (async function main() {
          if (hedgePercentage < 0.80) { throw new Error('hedgePercentage less than 0.80') };
          if (!order && !creating && !updating && !canceling) {
            if (shouldCreateFixOrder(fixPositionQtyS, fixPositionQtyB, currentPositionQtyS, currentPositionQtyB, fixerSettings)) {
              creating = getFixOrderCreate(hedgePercentage, fixSymbol, fixPositionQtyS, fixPositionQtyB, fixPositionType, currentPositionQtyS, currentPositionQtyB, ws, utils, fixerSettings);
              creatingTimeout = setTimeout(() => { throw new Error('creatingTimeout') }, 10000);
              try {
                const response = await sendRestCreateOrder(rest, creating);
                if (creating && !creating.id) creating.id = response.id;
                creatingHoldEvents.length ? creationsUpdatesFunc(creatingHoldEvents.splice(0)) : null;
              } catch (error) {
                if (error.type === 'post-only-reject') { creating = null }
                else if (error.type === 'insufficient-funds') { creating = null; hedgePercentage -= 0.0050; }
                else throw error;
              }
            }
          } else if (order && !creating && !updating && !canceling && fixPositionType === 'post-only'
            && ((order.side === 'sell' && order.price > ws.orderBooks.data[0].asks[0].price)
              || (order.side === 'buy' && order.price < ws.orderBooks.data[0].bids[0].price))) {
            if (rest.updateOrder) {
              updating = getFixOrderUpdate(ws, order, fixerSettings);
              updatingTimeout = setTimeout(() => { throw new Error('updatingTimeout') }, 10000);
              try {
                await sendRestUpdateOrder(rest, updating);
              } catch (error) {
                if (error.type === 'post-only-reject' || error.type === 'order-not-found' || error.type === 'insufficient-funds') { updating = null }
                else throw error;
              }
            } else {
              canceling = getFixOrderCancel(order);
              cancelingTimeout = setTimeout(() => { throw new Error('cancelingTimeout') }, 10000);
              try {
                await sendRestCancelOrder(rest, canceling);
              } catch (error) {
                if (error.type === 'order-not-found') { canceling = null }
                else throw error;
              }
            }
          }
          if (!shouldCreateFixOrder(fixPositionQtyS, fixPositionQtyB, currentPositionQtyS, currentPositionQtyB, fixerSettings)) {
            resolve();
            ws.orders.events.removeListener('creations-updates', creationsUpdatesFunc);
            ws.orders.events.removeListener('executions', executionsFunc);
            ws.orders.events.removeListener('cancelations', cancelationsFunc);
          } else {
            await wait(100); main();
          }
        })();
      });
    },
  };
  return fixer;
};
module.exports = Fixer;
