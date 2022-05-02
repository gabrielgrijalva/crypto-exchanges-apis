const ws = require('ws');
const moment = require('moment');
/**
  * 
  * 
  * 
  * HELPER FUNCTIONS
  * 
  * 
  * 
  */
/**
 * @param {number} id
 * @param {import('../../typings/_ws').orderBooksOrder[]} orders 
 */
function findOrderIndexById(id, orders) {
  return orders.findIndex(v => v.id === id);
};
/**
  * @param {number} price
  * @param {import('../../typings/_ws').orderBooksOrder[]} orders 
  */
function findOrderIndexByPriceAsk(price, orders) {
  return orders.findIndex(v => v.price >= price);
};
/**
 * @param {number} price
 * @param {import('../../typings/_ws').orderBooksOrder[]} orders 
 */
function findOrderIndexByPriceBid(price, orders) {
  return orders.findIndex(v => v.price <= price);
};
/**
 * @param {import('../../typings/_ws').orderBooksOrder[]} orders
 * @returns {(update: import('../../typings/_ws').orderBooksOrder) => void}
 */
function getDeleteOrderById(orders) {
  return function deleteOrderById(update) {
    const index = findOrderIndexById(update.id, orders);
    const orderToDelete = orders[index];
    if (orderToDelete) {
      orders.splice(index, 1);
    }
  };
};
/**
 * @param {import('../../typings/_ws').orderBooksOrder[]} orders
 * @returns {(update: import('../../typings/_ws').orderBooksOrder) => void}
 */
function getUpdateOrderById(orders) {
  return function updateOrderById(update) {
    const index = findOrderIndexById(update.id, orders);
    const orderToUpdate = orders[index];
    if (orderToUpdate) {
      if (update.price) {
        orderToUpdate.price = update.price;
      }
      if (update.quantity) {
        orderToUpdate.quantity = update.quantity;
      }
    }
  };
};
/**
 * @param {'asks' | 'bids'} side 
 * @param {import('../../typings/_ws').orderBooksOrder[]} orders
 * @returns {(update: import('../../typings/_ws').orderBooksOrder) => void}
 */
function getUpdateOrderByPrice(side, orders) {
  const findOrderIndexByPrice = side === 'asks' ? findOrderIndexByPriceAsk : findOrderIndexByPriceBid;
  return function updateOrderByPrice(update) {
    const index = findOrderIndexByPrice(update.price, orders);
    const orderToUpdate = orders[index];
    if (orderToUpdate) {
      if (orderToUpdate.price === update.price) {
        if (!update.quantity) {
          orders.splice(index, 1);
        } else {
          orderToUpdate.quantity = update.quantity;
        }
      } else {
        if (update.quantity) {
          orders.splice(index, 0, update);
        }
      }
    } else {
      if (update.quantity) {
        orders.splice(orders.length, 0, update);
      }
    }
  };
};
/** 
 * @param {import('../../typings/_ws').orderBooksOrder[]} orders
 * @returns {(snapshot: import('../../typings/_ws').orderBooksOrder[]) => void}
 */
function getInsertSnapshotFunction(orders) {
  return function insertSnapshotFunction(snapshot) {
    orders.length = 0;
    snapshot.forEach(v => orders.push(v));
  };
};
/** 
 * @param {import('../../typings/_ws').orderBooksSettings} orderBooksSettings
 */
function OrderBook(orderBooksSettings = {}) {
  orderBooksSettings.FROZEN_CHECK_INTERVAL = orderBooksSettings.FROZEN_CHECK_INTERVAL || 30000;
  orderBooksSettings.PRICE_OVERLAPS_CHECK_INTERVAL = orderBooksSettings.PRICE_OVERLAPS_CHECK_INTERVAL || 5000;
  /** @type {import('../../typings/_ws').orderBooksOrder[]} */
  const asks = [];
  /** @type {import('../../typings/_ws').orderBooksOrder[]} */
  const bids = [];
  /**
   * 
   * 
   * 
   * @type {import('../../typings/_ws').orderBooksData}
   * 
   * 
   * 
   */
  const orderBooks = {
    symbol: orderBooksSettings.SYMBOL,
    asks: asks,
    bids: bids,
    otherData: {},
    // Action by id
    deleteOrderByIdAsk: getDeleteOrderById(asks),
    deleteOrderByIdBid: getDeleteOrderById(bids),
    updateOrderByIdAsk: getUpdateOrderById(asks),
    updateOrderByIdBid: getUpdateOrderById(bids),
    // Action by price
    updateOrderByPriceAsk: getUpdateOrderByPrice('asks', asks),
    updateOrderByPriceBid: getUpdateOrderByPrice('bids', bids),
    // Insert snapshot
    insertSnapshotAsks: getInsertSnapshotFunction(asks),
    insertSnapshotBids: getInsertSnapshotFunction(bids),
  };
  let lastSnapshotAsks = '';
  let lastSnapshotBids = '';
  setInterval(() => {
    if (!orderBooks.asks[0] || !orderBooks.bids[0]) { return };
    if (orderBooks.asks[0].price <= orderBooks.bids[0].price) {
      throw { error: { type: 'order-book-price-overlaps', params: null, exchange: null } };
    }
  }, orderBooksSettings.PRICE_OVERLAPS_CHECK_INTERVAL);
  setInterval(() => {
    const currentSnapshotAsks = JSON.stringify(orderBooks.asks.slice(0, 10));
    const currentSnapshotBids = JSON.stringify(orderBooks.bids.slice(0, 10));
    if (lastSnapshotAsks === currentSnapshotAsks && lastSnapshotBids === currentSnapshotBids) {
      throw { error: { type: 'order-book-static', params: null, exchange: null } };
    }
    lastSnapshotAsks = currentSnapshotAsks;
    lastSnapshotBids = currentSnapshotBids;
  }, orderBooksSettings.FROZEN_CHECK_INTERVAL);
  return orderBooks;
};
module.exports = OrderBook;
