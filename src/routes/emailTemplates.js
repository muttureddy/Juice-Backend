/**
 * routes/emailTemplates.js
 * Email template management routes
 */

const express = require('express');
const router = express.Router();
const { getDB } = require('../db');
const { auth, adminAuth } = require('../middleware/auth');

// ── GET /api/email-templates (Admin Only) ────────────────
router.get('/', adminAuth, async (req, res) => {
  try {
    const db = getDB();
    let templates = await db.collection('emailTemplates').find().toArray();

    // If no templates exist, create default ones
    if (templates.length === 0) {
      const defaultTemplates = [
        {
          name: 'Order Confirmation',
          key: 'order_confirmation',
          subject: 'Order Confirmed! #{{orderId}} - Protein Spot',
          enabled: true,
          variables: ['orderId', 'customerName', 'items', 'subtotal', 'deliveryFee', 'total', 'deliveryAddress', 'estimatedDelivery'],
          description: 'Sent when a new order is placed',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          name: 'Order Status Update',
          key: 'order_status',
          subject: '{{statusTitle}} - Order #{{orderId}}',
          enabled: true,
          variables: ['orderId', 'statusTitle', 'statusEmoji', 'statusColor', 'statusMessage'],
          description: 'Sent when order status changes',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          name: 'Welcome Email',
          key: 'welcome',
          subject: 'Welcome to Protein Spot! 🎉',
          enabled: true,
          variables: ['userName'],
          description: 'Sent to new users after registration',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          name: 'Contact Form Notification',
          key: 'contact_form',
          subject: 'New Contact Form: {{subject}}',
          enabled: true,
          variables: ['name', 'email', 'phone', 'subject', 'message', 'receivedAt'],
          description: 'Sent to admin when contact form is submitted',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          name: 'Order Delivered',
          key: 'order_delivered',
          subject: '🎉 Your Order #{{orderId}} has been Delivered!',
          enabled: true,
          variables: ['orderId', 'customerName', 'deliveryTime'],
          description: 'Sent when order is delivered',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      await db.collection('emailTemplates').insertMany(defaultTemplates);
      templates = defaultTemplates;
    }

    res.json(templates);
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({ message: 'Failed to fetch templates' });
  }
});

// ── PUT /api/email-templates/:id (Admin Only) ────────────
router.put('/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { subject, enabled } = req.body;

    const db = getDB();
    const result = await db.collection('emailTemplates').updateOne(
      { _id: require('../db').toObjectId(id) },
      {
        $set: {
          subject,
          enabled,
          updatedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Template not found' });
    }

    res.json({ message: 'Template updated successfully' });
  } catch (error) {
    console.error('Update template error:', error);
    res.status(500).json({ message: 'Failed to update template' });
  }
});

// ── POST /api/email-templates/test (Admin Only) ───────────
router.post('/test', adminAuth, async (req, res) => {
  try {
    const { templateKey, testEmail } = req.body;
    const emailService = require('../services/emailService');

    // Test email based on template key
    let result;
    switch (templateKey) {
      case 'welcome':
        result = await emailService.sendWelcomeEmail('Test User', testEmail);
        break;
      
      case 'order_confirmation':
        const testOrder = {
          orderId: 'TEST123456',
          items: [
            { name: 'Protein Bowl', quantity: 1, price: 199 },
            { name: 'Green Juice', quantity: 1, price: 149 },
          ],
          subtotal: 348,
          deliveryFee: 0,
          total: 348,
          customerDetails: {
            name: 'Test User',
            phone: '+91 9876543210',
            address: {
              street: '123 Test Street',
              city: 'Test City',
              state: 'Test State',
              pincode: '123456',
            },
          },
          estimatedDelivery: new Date(Date.now() + 2 * 60 * 60 * 1000),
        };
        result = await emailService.sendOrderConfirmationEmail(testOrder, testEmail);
        break;
      
      case 'order_status':
        const testStatusOrder = {
          orderId: 'TEST123456',
        };
        result = await emailService.sendOrderStatusEmail(testStatusOrder, testEmail, 'out_for_delivery');
        break;
      
      case 'contact_form':
        const testContact = {
          name: 'Test User',
          email: testEmail,
          phone: '+91 9876543210',
          subject: 'Test Subject',
          message: 'This is a test message from the email template manager.',
        };
        result = await emailService.sendContactSubmissionEmail(testContact);
        break;
      
      default:
        return res.status(400).json({ message: 'Invalid template key' });
    }

    res.json({ 
      message: 'Test email sent successfully!',
      messageId: result.messageId 
    });
  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({ message: error.message || 'Failed to send test email' });
  }
});

// ── GET /api/email-templates/settings (Admin Only) ────────
router.get('/settings', adminAuth, async (req, res) => {
  try {
    const db = getDB();
    let settings = await db.collection('emailSettings').findOne({ type: 'smtp' });

    if (!settings) {
      settings = {
        type: 'smtp',
        host: process.env.ZOHO_SMTP_HOST || 'smtp.zoho.com',
        port: parseInt(process.env.ZOHO_SMTP_PORT || '465'),
        user: process.env.ZOHO_EMAIL_USER || '',
        fromName: process.env.EMAIL_FROM_NAME || 'Protein Spot',
        contactPhone: process.env.CONTACT_PHONE || '+91 98765 43210',
        createdAt: new Date(),
      };
      await db.collection('emailSettings').insertOne(settings);
    }

    res.json(settings);
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ message: 'Failed to fetch settings' });
  }
});

module.exports = router;
