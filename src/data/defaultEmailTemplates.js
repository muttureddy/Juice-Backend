/**
 * Default Email Templates
 * These will be seeded into the database
 */

const defaultTemplates = [
  {
    name: 'welcome',
    subject: 'Welcome to Protein Spot! 🥗',
    description: 'Sent when a new user registers',
    variables: ['customerName', 'loginLink'],
    isActive: true,
    htmlBody: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Protein Spot</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #2D8B4E 0%, #4CAF72 100%); padding: 40px 20px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: bold;">Welcome to Protein Spot! 🥗</h1>
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="color: #2D8B4E; margin-top: 0;">Hi {{customerName}}!</h2>
              <p style="color: #333; font-size: 16px; line-height: 1.6;">
                Welcome to <strong>Protein Spot</strong> - your destination for fresh, healthy, and protein-rich meals!
              </p>
              <p style="color: #333; font-size: 16px; line-height: 1.6;">
                We're thrilled to have you join our community of health-conscious food lovers. Get ready to enjoy:
              </p>
              <ul style="color: #333; font-size: 16px; line-height: 1.8;">
                <li>🌿 100% Fresh & Natural ingredients</li>
                <li>💪 High-protein meals for fitness</li>
                <li>🥗 Delicious salads & bowls</li>
                <li>🚚 Fast delivery within 2 hours</li>
                <li>🌱 100% Vegetarian options</li>
              </ul>
              <div style="text-align: center; margin: 30px 0;">
                <a href="{{loginLink}}" style="background: linear-gradient(135deg, #2D8B4E 0%, #4CAF72 100%); color: #ffffff; padding: 15px 40px; text-decoration: none; border-radius: 50px; font-weight: bold; display: inline-block;">
                  Start Ordering Now
                </a>
              </div>
              <p style="color: #666; font-size: 14px; line-height: 1.6;">
                Questions? We're here to help! Contact us anytime at <a href="mailto:info@proteinspot.in" style="color: #2D8B4E;">info@proteinspot.in</a>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9f9f9; padding: 20px; text-align: center; border-top: 1px solid #e0e0e0;">
              <p style="margin: 0; color: #999; font-size: 12px;">
                Fresh • Healthy • Vegetarian
              </p>
              <p style="margin: 5px 0 0 0; color: #999; font-size: 12px;">
                © 2026 Protein Spot. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
    textBody: `Hi {{customerName}}!

Welcome to Protein Spot - your destination for fresh, healthy, and protein-rich meals!

We're thrilled to have you join our community. Get ready to enjoy:
- 100% Fresh & Natural ingredients
- High-protein meals for fitness
- Delicious salads & bowls
- Fast delivery within 2 hours
- 100% Vegetarian options

Start ordering now: {{loginLink}}

Questions? Contact us at info@proteinspot.in

Fresh • Healthy • Vegetarian
© 2026 Protein Spot. All rights reserved.`
  },
  
  {
    name: 'order_confirmation',
    subject: 'Order Confirmed! #{{orderNumber}}',
    description: 'Sent when an order is placed',
    variables: ['customerName', 'orderNumber', 'orderTotal', 'estimatedDelivery', 'items', 'deliveryAddress', 'trackingLink'],
    isActive: true,
    htmlBody: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Order Confirmation</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px;">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #2D8B4E 0%, #4CAF72 100%); padding: 30px 20px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px;">✅ Order Confirmed!</h1>
              <p style="margin: 10px 0 0 0; color: #ffffff; font-size: 16px;">Order #{{orderNumber}}</p>
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="padding: 30px;">
              <p style="color: #333; font-size: 16px; margin-top: 0;">Hi {{customerName}},</p>
              <p style="color: #333; font-size: 16px;">
                Thank you for your order! We're preparing your fresh, healthy meal right now. 🥗
              </p>
              
              <div style="background-color: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="margin: 0 0 15px 0; color: #2D8B4E;">Order Details</h3>
                {{items}}
                <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 15px 0;">
                <div style="text-align: right;">
                  <p style="margin: 5px 0; color: #666; font-size: 14px;">Order Total:</p>
                  <p style="margin: 0; color: #2D8B4E; font-size: 24px; font-weight: bold;">₹{{orderTotal}}</p>
                </div>
              </div>
              
              <div style="background-color: #e8f5e9; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="margin: 0 0 10px 0; color: #2D8B4E;">📍 Delivery Address</h3>
                <p style="margin: 0; color: #333; font-size: 14px; line-height: 1.6;">{{deliveryAddress}}</p>
              </div>
              
              <div style="background-color: #fff3e0; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="margin: 0 0 10px 0; color: #f57c00;">🕐 Estimated Delivery</h3>
                <p style="margin: 0; color: #333; font-size: 16px; font-weight: bold;">{{estimatedDelivery}}</p>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="{{trackingLink}}" style="background: linear-gradient(135deg, #2D8B4E 0%, #4CAF72 100%); color: #ffffff; padding: 15px 40px; text-decoration: none; border-radius: 50px; font-weight: bold; display: inline-block;">
                  Track Your Order
                </a>
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9f9f9; padding: 20px; text-align: center; border-top: 1px solid #e0e0e0;">
              <p style="margin: 0; color: #999; font-size: 12px;">
                Questions? Contact us at <a href="mailto:info@proteinspot.in" style="color: #2D8B4E;">info@proteinspot.in</a>
              </p>
              <p style="margin: 10px 0 0 0; color: #999; font-size: 12px;">
                © 2026 Protein Spot. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
    textBody: `Hi {{customerName}},

✅ Order Confirmed!
Order #{{orderNumber}}

Thank you for your order! We're preparing your fresh, healthy meal right now.

ORDER DETAILS:
{{items}}

Order Total: ₹{{orderTotal}}

DELIVERY ADDRESS:
{{deliveryAddress}}

ESTIMATED DELIVERY:
{{estimatedDelivery}}

Track your order: {{trackingLink}}

Questions? Contact us at info@proteinspot.in

© 2026 Protein Spot. All rights reserved.`
  },
  
  {
    name: 'order_delivered',
    subject: 'Your Order Has Been Delivered! 🎉',
    description: 'Sent when an order is delivered',
    variables: ['customerName', 'orderNumber', 'feedbackLink'],
    isActive: true,
    htmlBody: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Order Delivered</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px;">
          <tr>
            <td style="background: linear-gradient(135deg, #2D8B4E 0%, #4CAF72 100%); padding: 30px 20px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 32px;">🎉 Delivered!</h1>
            </td>
          </tr>
          
          <tr>
            <td style="padding: 40px 30px; text-align: center;">
              <h2 style="color: #2D8B4E; margin-top: 0;">Hi {{customerName}}!</h2>
              <p style="color: #333; font-size: 18px; line-height: 1.6;">
                Your order <strong>#{{orderNumber}}</strong> has been delivered! 🥗
              </p>
              <p style="color: #666; font-size: 16px; line-height: 1.6;">
                We hope you enjoy your fresh, healthy meal from Protein Spot!
              </p>
              
              <div style="background-color: #e8f5e9; padding: 30px; border-radius: 8px; margin: 30px 0;">
                <h3 style="margin: 0 0 15px 0; color: #2D8B4E;">How was your experience?</h3>
                <p style="margin: 0 0 20px 0; color: #666; font-size: 14px;">
                  Your feedback helps us serve you better!
                </p>
                <a href="{{feedbackLink}}" style="background-color: #FFB347; color: #ffffff; padding: 15px 40px; text-decoration: none; border-radius: 50px; font-weight: bold; display: inline-block;">
                  Rate Your Order
                </a>
              </div>
              
              <p style="color: #999; font-size: 14px; margin: 30px 0 0 0;">
                Thank you for choosing Protein Spot! 💚
              </p>
            </td>
          </tr>
          
          <tr>
            <td style="background-color: #f9f9f9; padding: 20px; text-align: center; border-top: 1px solid #e0e0e0;">
              <p style="margin: 0; color: #999; font-size: 12px;">
                © 2026 Protein Spot. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
    textBody: `Hi {{customerName}}!

🎉 Your order #{{orderNumber}} has been delivered!

We hope you enjoy your fresh, healthy meal from Protein Spot!

HOW WAS YOUR EXPERIENCE?
Your feedback helps us serve you better!
Rate your order: {{feedbackLink}}

Thank you for choosing Protein Spot! 💚

© 2026 Protein Spot. All rights reserved.`
  },
  
  {
    name: 'order_cancelled',
    subject: 'Order Cancelled - #{{orderNumber}}',
    description: 'Sent when an order is cancelled',
    variables: ['customerName', 'orderNumber', 'refundAmount', 'refundEta'],
    isActive: true,
    htmlBody: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Order Cancelled</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px;">
          <tr>
            <td style="background-color: #f44336; padding: 30px 20px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px;">Order Cancelled</h1>
            </td>
          </tr>
          
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #333; font-size: 16px; margin-top: 0;">Hi {{customerName}},</p>
              <p style="color: #333; font-size: 16px;">
                Your order <strong>#{{orderNumber}}</strong> has been cancelled as requested.
              </p>
              
              <div style="background-color: #fff3e0; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="margin: 0 0 10px 0; color: #f57c00;">💰 Refund Information</h3>
                <p style="margin: 0; color: #333; font-size: 14px;">Amount: <strong>₹{{refundAmount}}</strong></p>
                <p style="margin: 5px 0 0 0; color: #666; font-size: 14px;">ETA: {{refundEta}}</p>
              </div>
              
              <p style="color: #666; font-size: 14px; line-height: 1.6;">
                We're sorry to see this order go! If you have any questions or concerns, please don't hesitate to reach out.
              </p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="{{loginLink}}" style="background: linear-gradient(135deg, #2D8B4E 0%, #4CAF72 100%); color: #ffffff; padding: 15px 40px; text-decoration: none; border-radius: 50px; font-weight: bold; display: inline-block;">
                  Browse Menu
                </a>
              </div>
            </td>
          </tr>
          
          <tr>
            <td style="background-color: #f9f9f9; padding: 20px; text-align: center; border-top: 1px solid #e0e0e0;">
              <p style="margin: 0; color: #999; font-size: 12px;">
                Questions? Contact us at <a href="mailto:info@proteinspot.in" style="color: #2D8B4E;">info@proteinspot.in</a>
              </p>
              <p style="margin: 10px 0 0 0; color: #999; font-size: 12px;">
                © 2026 Protein Spot. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
    textBody: `Hi {{customerName}},

Your order #{{orderNumber}} has been cancelled as requested.

REFUND INFORMATION:
Amount: ₹{{refundAmount}}
ETA: {{refundEta}}

We're sorry to see this order go! If you have any questions, please contact us.

Browse our menu: {{loginLink}}

Questions? Contact us at info@proteinspot.in

© 2026 Protein Spot. All rights reserved.`
  },
  
  {
    name: 'password_reset',
    subject: 'Reset Your Password - Protein Spot',
    description: 'Sent when user requests password reset',
    variables: ['customerName', 'resetLink', 'expiryTime'],
    isActive: true,
    htmlBody: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Password Reset</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px;">
          <tr>
            <td style="padding: 40px 30px; text-align: center;">
              <h1 style="color: #2D8B4E; margin: 0 0 20px 0;">🔐 Password Reset Request</h1>
              <p style="color: #333; font-size: 16px;">Hi {{customerName}},</p>
              <p style="color: #333; font-size: 16px;">
                We received a request to reset your password. Click the button below to create a new password:
              </p>
              
              <div style="margin: 30px 0;">
                <a href="{{resetLink}}" style="background: linear-gradient(135deg, #2D8B4E 0%, #4CAF72 100%); color: #ffffff; padding: 15px 40px; text-decoration: none; border-radius: 50px; font-weight: bold; display: inline-block;">
                  Reset Password
                </a>
              </div>
              
              <p style="color: #666; font-size: 14px;">
                This link will expire in <strong>{{expiryTime}}</strong>.
              </p>
              
              <div style="background-color: #fff3e0; padding: 20px; border-radius: 8px; margin: 30px 0;">
                <p style="margin: 0; color: #f57c00; font-size: 14px;">
                  ⚠️ If you didn't request this, please ignore this email. Your password will remain unchanged.
                </p>
              </div>
            </td>
          </tr>
          
          <tr>
            <td style="background-color: #f9f9f9; padding: 20px; text-align: center; border-top: 1px solid #e0e0e0;">
              <p style="margin: 0; color: #999; font-size: 12px;">
                © 2026 Protein Spot. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
    textBody: `Hi {{customerName}},

🔐 Password Reset Request

We received a request to reset your password. Click the link below to create a new password:

{{resetLink}}

This link will expire in {{expiryTime}}.

⚠️ If you didn't request this, please ignore this email. Your password will remain unchanged.

© 2026 Protein Spot. All rights reserved.`
  }
];

module.exports = defaultTemplates;
