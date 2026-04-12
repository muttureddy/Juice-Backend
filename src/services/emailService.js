/**
 * services/emailService.js
 * Email service using Nodemailer with Zoho SMTP
 */

const nodemailer = require('nodemailer');

// Create Zoho transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.ZOHO_SMTP_HOST || 'smtp.zoho.com',
    port: parseInt(process.env.ZOHO_SMTP_PORT || '465'),
    secure: true, // use SSL
    auth: {
      user: process.env.ZOHO_EMAIL_USER, // your domain email
      pass: process.env.ZOHO_EMAIL_PASSWORD, // your email password
    },
  });
};

/**
 * Send email using template
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @param {string} options.text - Plain text content (optional)
 */
const sendEmail = async ({ to, subject, html, text }) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: {
        name: process.env.EMAIL_FROM_NAME || 'Protein Spot',
        address: process.env.ZOHO_EMAIL_USER,
      },
      to,
      subject,
      html,
      text: text || '', // Fallback to empty if no text provided
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Email sending failed:', error);
    throw new Error(`Failed to send email: ${error.message}`);
  }
};

/**
 * Send Order Confirmation Email
 */
const sendOrderConfirmationEmail = async (order, userEmail) => {
  const itemsList = order.items
    .map(
      (item) => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
        <strong>${item.name}</strong><br>
        <span style="color: #6b7280; font-size: 14px;">Qty: ${item.quantity} × ₹${item.price}</span>
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">
        <strong>₹${(item.quantity * item.price).toFixed(2)}</strong>
      </td>
    </tr>
  `
    )
    .join('');

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Confirmation</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #2D8B4E 0%, #4CAF72 100%); padding: 40px 20px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">🎉 Order Confirmed!</h1>
              <p style="color: #ffffff; margin: 10px 0 0 0; opacity: 0.9;">Thank you for your order</p>
            </td>
          </tr>
          
          <!-- Order ID -->
          <tr>
            <td style="padding: 30px 40px 20px 40px; text-align: center; background-color: #f9fafb;">
              <p style="margin: 0; color: #6b7280; font-size: 14px;">Order ID</p>
              <h2 style="margin: 5px 0 0 0; color: #1f2937; font-size: 24px;">#${order.orderId}</h2>
            </td>
          </tr>
          
          <!-- Order Items -->
          <tr>
            <td style="padding: 20px 40px;">
              <h3 style="color: #1f2937; margin: 0 0 15px 0;">Order Details</h3>
              <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;">
                ${itemsList}
              </table>
            </td>
          </tr>
          
          <!-- Order Summary -->
          <tr>
            <td style="padding: 0 40px 20px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding: 8px 0; color: #6b7280;">Subtotal</td>
                  <td style="padding: 8px 0; text-align: right; color: #1f2937;">₹${order.subtotal.toFixed(2)}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6b7280;">Delivery Fee</td>
                  <td style="padding: 8px 0; text-align: right; color: ${order.deliveryFee === 0 ? '#2D8B4E' : '#1f2937'};">
                    ${order.deliveryFee === 0 ? 'FREE' : '₹' + order.deliveryFee.toFixed(2)}
                  </td>
                </tr>
                <tr style="border-top: 2px solid #2D8B4E;">
                  <td style="padding: 12px 0; font-weight: bold; font-size: 18px; color: #1f2937;">Total</td>
                  <td style="padding: 12px 0; text-align: right; font-weight: bold; font-size: 18px; color: #2D8B4E;">₹${order.total.toFixed(2)}</td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Delivery Address -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f9fafb;">
              <h3 style="color: #1f2937; margin: 0 0 10px 0;">📍 Delivery Address</h3>
              <p style="margin: 5px 0; color: #4b5563; line-height: 1.6;">
                <strong>${order.customerDetails.name}</strong><br>
                ${order.customerDetails.phone}<br>
                ${order.customerDetails.address.street}<br>
                ${order.customerDetails.address.city}, ${order.customerDetails.address.state || ''} ${order.customerDetails.address.pincode}
              </p>
            </td>
          </tr>
          
          <!-- Estimated Delivery -->
          <tr>
            <td style="padding: 20px 40px; text-align: center;">
              <p style="margin: 0; color: #6b7280; font-size: 14px;">Estimated Delivery</p>
              <p style="margin: 5px 0 0 0; color: #2D8B4E; font-size: 18px; font-weight: bold;">
                ${new Date(order.estimatedDelivery).toLocaleString('en-IN', { 
                  day: 'numeric', 
                  month: 'short', 
                  hour: '2-digit', 
                  minute: '2-digit' 
                })}
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; text-align: center; background-color: #1f2937; color: #ffffff;">
              <p style="margin: 0 0 10px 0; font-size: 14px;">Questions? Contact us anytime!</p>
              <p style="margin: 0; font-size: 14px; opacity: 0.8;">
                📧 ${process.env.ZOHO_EMAIL_USER} | 📞 ${process.env.CONTACT_PHONE || '+91 98765 43210'}
              </p>
              <p style="margin: 15px 0 0 0; font-size: 12px; opacity: 0.6;">
                © ${new Date().getFullYear()} Protein Spot. All rights reserved.
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  return sendEmail({
    to: userEmail,
    subject: `Order Confirmed! #${order.orderId} - Protein Spot`,
    html,
  });
};

/**
 * Send Order Status Update Email
 */
const sendOrderStatusEmail = async (order, userEmail, newStatus) => {
  const statusConfig = {
    confirmed: { emoji: '✅', title: 'Order Confirmed', color: '#3b82f6' },
    preparing: { emoji: '👨‍🍳', title: 'Preparing Your Order', color: '#8b5cf6' },
    shipped: { emoji: '📦', title: 'Order Shipped', color: '#f97316' },
    out_for_delivery: { emoji: '🚴', title: 'Out for Delivery', color: '#06b6d4' },
    delivered: { emoji: '🎉', title: 'Order Delivered', color: '#10b981' },
    cancelled: { emoji: '❌', title: 'Order Cancelled', color: '#ef4444' },
  };

  const status = statusConfig[newStatus] || statusConfig.confirmed;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          
          <tr>
            <td style="background-color: ${status.color}; padding: 40px 20px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 32px;">${status.emoji}</h1>
              <h2 style="color: #ffffff; margin: 10px 0 0 0; font-size: 24px;">${status.title}</h2>
            </td>
          </tr>
          
          <tr>
            <td style="padding: 40px; text-align: center;">
              <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px;">Order ID</p>
              <h3 style="margin: 0; color: #1f2937; font-size: 20px;">#${order.orderId}</h3>
              
              <div style="margin: 30px 0; padding: 20px; background-color: #f9fafb; border-radius: 8px;">
                <p style="margin: 0; color: #4b5563; line-height: 1.6;">
                  ${newStatus === 'delivered' 
                    ? 'Your order has been successfully delivered! We hope you enjoy your fresh, healthy meal! 😊' 
                    : newStatus === 'cancelled'
                    ? 'Your order has been cancelled. If you have any questions, please contact our support team.'
                    : 'We\'re working on your order and will keep you updated every step of the way!'}
                </p>
              </div>
              
              ${newStatus === 'out_for_delivery' ? `
              <p style="margin: 20px 0; color: #2D8B4E; font-weight: bold; font-size: 16px;">
                🕐 Your order will arrive within 2 hours!
              </p>
              ` : ''}
            </td>
          </tr>
          
          <tr>
            <td style="padding: 30px 40px; text-align: center; background-color: #1f2937; color: #ffffff;">
              <p style="margin: 0 0 10px 0;">Track your order anytime!</p>
              <p style="margin: 0; font-size: 12px; opacity: 0.8;">
                © ${new Date().getFullYear()} Protein Spot
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  return sendEmail({
    to: userEmail,
    subject: `${status.title} - Order #${order.orderId}`,
    html,
  });
};

/**
 * Send Contact Form Submission Email
 */
const sendContactSubmissionEmail = async (contactData) => {
  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; padding: 20px; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; padding: 30px;">
    <h2 style="color: #2D8B4E; margin-bottom: 20px;">📬 New Contact Form Submission</h2>
    
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #4b5563;">Name:</td>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: #1f2937;">${contactData.name}</td>
      </tr>
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #4b5563;">Email:</td>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: #1f2937;">${contactData.email}</td>
      </tr>
      ${contactData.phone ? `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #4b5563;">Phone:</td>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: #1f2937;">${contactData.phone}</td>
      </tr>
      ` : ''}
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #4b5563;">Subject:</td>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: #1f2937;">${contactData.subject}</td>
      </tr>
      <tr>
        <td colspan="2" style="padding: 20px 10px; border-bottom: 1px solid #e5e7eb;">
          <p style="margin: 0 0 5px 0; font-weight: bold; color: #4b5563;">Message:</p>
          <p style="margin: 0; color: #1f2937; line-height: 1.6;">${contactData.message}</p>
        </td>
      </tr>
      <tr>
        <td style="padding: 10px; font-weight: bold; color: #4b5563;">Received:</td>
        <td style="padding: 10px; color: #1f2937;">${new Date().toLocaleString('en-IN')}</td>
      </tr>
    </table>
  </div>
</body>
</html>
  `;

  return sendEmail({
    to: process.env.ZOHO_EMAIL_USER, // Send to admin email
    subject: `New Contact Form: ${contactData.subject}`,
    html,
  });
};

/**
 * Send Welcome Email
 */
const sendWelcomeEmail = async (userName, userEmail) => {
  const html = `
<!DOCTYPE html>
<html>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          
          <tr>
            <td style="background: linear-gradient(135deg, #2D8B4E 0%, #4CAF72 100%); padding: 50px 20px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 32px;">Welcome to Protein Spot! 🎉</h1>
              <p style="color: #ffffff; margin: 15px 0 0 0; font-size: 16px; opacity: 0.95;">Your journey to healthy living starts here</p>
            </td>
          </tr>
          
          <tr>
            <td style="padding: 40px;">
              <h2 style="color: #1f2937; margin: 0 0 15px 0;">Hi ${userName}! 👋</h2>
              <p style="color: #4b5563; line-height: 1.8; margin: 0 0 20px 0;">
                We're thrilled to have you join the Protein Spot family! Get ready to experience fresh, 
                healthy, and protein-rich meals delivered right to your doorstep.
              </p>
              
              <div style="background-color: #f0fdf4; border-left: 4px solid #2D8B4E; padding: 20px; margin: 20px 0;">
                <h3 style="color: #2D8B4E; margin: 0 0 10px 0;">🌟 What makes us special?</h3>
                <ul style="margin: 0; padding-left: 20px; color: #4b5563;">
                  <li>100% Fresh & Natural ingredients</li>
                  <li>High Protein, Low Calorie meals</li>
                  <li>Delivered within 2 hours</li>
                  <li>Free delivery on orders above ₹299</li>
                </ul>
              </div>
              
              <p style="color: #4b5563; line-height: 1.8; margin: 20px 0;">
                Ready to order? Browse our menu and discover your new favorite healthy meal!
              </p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.FRONTEND_URL || 'https://proteinspot.in'}/products" 
                   style="display: inline-block; background: linear-gradient(135deg, #2D8B4E, #4CAF72); 
                          color: #ffffff; text-decoration: none; padding: 15px 40px; 
                          border-radius: 50px; font-weight: bold; font-size: 16px;">
                  Browse Menu 🥗
                </a>
              </div>
            </td>
          </tr>
          
          <tr>
            <td style="padding: 30px; text-align: center; background-color: #1f2937; color: #ffffff;">
              <p style="margin: 0 0 10px 0;">Need help? We're here for you!</p>
              <p style="margin: 0; font-size: 14px; opacity: 0.8;">
                📧 ${process.env.ZOHO_EMAIL_USER} | 📞 ${process.env.CONTACT_PHONE || '+91 98765 43210'}
              </p>
              <p style="margin: 15px 0 0 0; font-size: 12px; opacity: 0.6;">
                © ${new Date().getFullYear()} Protein Spot. Fresh • Healthy • Vegetarian
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  return sendEmail({
    to: userEmail,
    subject: 'Welcome to Protein Spot! 🎉',
    html,
  });
};

module.exports = {
  sendEmail,
  sendOrderConfirmationEmail,
  sendOrderStatusEmail,
  sendContactSubmissionEmail,
  sendWelcomeEmail,
};
