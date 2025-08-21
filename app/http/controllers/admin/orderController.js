// controllers/orderController.js
const Order = require('../../../models/order') // your model

function orderController() {
  return {
    // admin orders listing (existing)
    index(req, res) {
      Order.find({ status: { $ne: 'completed' } }, null, { sort: { 'createdAt': -1 }})
        .populate('customerId', '-password')
        .exec((err, orders) => {
          if (req.xhr) {
            return res.json(orders)
          } else {
            return res.render('admin/orders')
          }
        })
    },

    // store: create a new order -> emit orderPlaced after saving (for admin notification)
    async store(req, res) {
      // expected fields: items, phone, address, paymentType, paymentStatus (from client)
      const { items, phone, address, paymentType, paymentStatus } = req.body

      // ensure user is logged in (adjust if your flow differs)
      if (!req.user) {
        return res.status(401).json({ error: 'You must be logged in to place an order' })
      }

      try {
        const order = new Order({
          customerId: req.user._id,
          items,
          phone,
          address,
          paymentType: paymentType || 'COD',
          paymentStatus: paymentStatus === 'true' || paymentStatus === true
        })

        const newOrder = await order.save()

        // populate customer fields so admin client can render name
        const populatedOrder = await Order.findById(newOrder._id)
          .populate('customerId', 'name email') // only send needed fields
          .exec()

        // emit event using app's eventEmitter (set in server.js)
        const eventEmitter = req.app.get('eventEmitter')
        eventEmitter.emit('orderPlaced', populatedOrder)

        // respond to client (adjust if you redirect instead)
        return res.status(201).json({ message: 'Order placed successfully', order: newOrder })
      } catch (err) {
        console.error('Order store error:', err)
        return res.status(500).json({ error: 'Could not place order' })
      }
    },

    // updateStatus: admin changes order status -> emit orderUpdated to order room
    async updateStatus(req, res) {
      const { orderId, status } = req.body
      try {
        const order = await Order.findById(orderId)
        if (!order) {
          return res.status(404).json({ error: 'Order not found' })
        }

        order.status = status
        await order.save()

        // populate customer (optional)
        const populatedOrder = await Order.findById(orderId)
          .populate('customerId', 'name email')
          .exec()

        // emit update for the specific order room so customer tracking page updates
        const eventEmitter = req.app.get('eventEmitter')
        eventEmitter.emit('orderUpdated', {
          id: orderId,
          status: order.status,
          updatedAt: order.updatedAt,
          order: populatedOrder
        })

        // If admin uses form submit, redirect back to admin orders
        return res.redirect('/admin/orders')
      } catch (err) {
        console.error('Update status error:', err)
        return res.status(500).json({ error: 'Could not update order status' })
      }
    }
  }
}

module.exports = orderController
