// Example: Update orders.js to use SSE notifications
// Replace Socket.IO emit with SSE send

// OLD Socket.IO way:
// const io = req.app.locals.io;
// if (io) {
//   io.to('admin').emit('new_order', { message: '...' });
// }

// NEW SSE way:
// global.sendToAdmins({ type: 'new_order', message: '...' });

// In routes/orders.js - After creating order:

// ── Send notification to admins ──
if (global.sendToAdmins) {
  global.sendToAdmins({
    type: 'new_order',
    message: `New order from ${customerDetails?.name || 'customer'} — ₹${total}`,
    orderId: savedOrder._id,
    total,
  });
}

// ── Send notification to user ──
if (global.sendNotification) {
  global.sendNotification(String(userId), {
    type: 'order_confirmed',
    message: 'Your order has been confirmed!',
    orderId: savedOrder._id,
  });
}
