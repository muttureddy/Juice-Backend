/**
 * Email Templates Management Routes
 * Admin can create, edit, and manage email templates
 */

const express = require('express');
const router = express.Router();
const { getDB, toObjectId } = require('../db');
const { auth, adminAuth } = require('../middleware/auth');
const { sendEmail, sendTestEmail, verifyEmailConfig } = require('../utils/emailService');

// ── GET all email templates (Admin only) ────────────────────
router.get('/', adminAuth, async (req, res) => {
  try {
    const db = getDB();
    const templates = await db.collection('emailTemplates')
      .find({})
      .sort({ name: 1 })
      .toArray();
    
    res.json(templates);
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({ message: 'Failed to fetch templates' });
  }
});

// ── GET single email template by ID (Admin only) ─────────────
router.get('/:id', adminAuth, async (req, res) => {
  try {
    const db = getDB();
    const _id = toObjectId(req.params.id);
    
    if (!_id) {
      return res.status(400).json({ message: 'Invalid template ID' });
    }
    
    const template = await db.collection('emailTemplates').findOne({ _id });
    
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }
    
    res.json(template);
  } catch (error) {
    console.error('Get template error:', error);
    res.status(500).json({ message: 'Failed to fetch template' });
  }
});

// ── CREATE new email template (Admin only) ───────────────────
router.post('/', adminAuth, async (req, res) => {
  try {
    const { name, subject, htmlBody, textBody, description, variables } = req.body;
    
    if (!name || !subject || !htmlBody) {
      return res.status(400).json({ message: 'Name, subject, and HTML body are required' });
    }
    
    const db = getDB();
    
    // Check if template with same name exists
    const existing = await db.collection('emailTemplates').findOne({ name });
    if (existing) {
      return res.status(400).json({ message: 'Template with this name already exists' });
    }
    
    const template = {
      name,
      subject,
      htmlBody,
      textBody: textBody || htmlBody.replace(/<[^>]*>/g, ''), // Strip HTML for text version
      description: description || '',
      variables: variables || [],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    const result = await db.collection('emailTemplates').insertOne(template);
    
    res.status(201).json({
      message: 'Template created successfully',
      template: { ...template, _id: result.insertedId }
    });
  } catch (error) {
    console.error('Create template error:', error);
    res.status(500).json({ message: 'Failed to create template' });
  }
});

// ── UPDATE email template (Admin only) ───────────────────────
router.put('/:id', adminAuth, async (req, res) => {
  try {
    const db = getDB();
    const _id = toObjectId(req.params.id);
    
    if (!_id) {
      return res.status(400).json({ message: 'Invalid template ID' });
    }
    
    const { subject, htmlBody, textBody, description, variables, isActive } = req.body;
    
    const updateData = {
      updatedAt: new Date(),
    };
    
    if (subject !== undefined) updateData.subject = subject;
    if (htmlBody !== undefined) updateData.htmlBody = htmlBody;
    if (textBody !== undefined) updateData.textBody = textBody;
    if (description !== undefined) updateData.description = description;
    if (variables !== undefined) updateData.variables = variables;
    if (isActive !== undefined) updateData.isActive = isActive;
    
    const result = await db.collection('emailTemplates').findOneAndUpdate(
      { _id },
      { $set: updateData },
      { returnDocument: 'after' }
    );
    
    if (!result) {
      return res.status(404).json({ message: 'Template not found' });
    }
    
    res.json({
      message: 'Template updated successfully',
      template: result
    });
  } catch (error) {
    console.error('Update template error:', error);
    res.status(500).json({ message: 'Failed to update template' });
  }
});

// ── DELETE email template (Admin only) ───────────────────────
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const db = getDB();
    const _id = toObjectId(req.params.id);
    
    if (!_id) {
      return res.status(400).json({ message: 'Invalid template ID' });
    }
    
    const result = await db.collection('emailTemplates').deleteOne({ _id });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Template not found' });
    }
    
    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    console.error('Delete template error:', error);
    res.status(500).json({ message: 'Failed to delete template' });
  }
});

// ── TOGGLE template active status (Admin only) ───────────────
router.patch('/:id/toggle', adminAuth, async (req, res) => {
  try {
    const db = getDB();
    const _id = toObjectId(req.params.id);
    
    if (!_id) {
      return res.status(400).json({ message: 'Invalid template ID' });
    }
    
    const template = await db.collection('emailTemplates').findOne({ _id });
    
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }
    
    const result = await db.collection('emailTemplates').findOneAndUpdate(
      { _id },
      { $set: { isActive: !template.isActive, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
    
    res.json({
      message: `Template ${result.isActive ? 'activated' : 'deactivated'} successfully`,
      template: result
    });
  } catch (error) {
    console.error('Toggle template error:', error);
    res.status(500).json({ message: 'Failed to toggle template' });
  }
});

// ── SEND test email (Admin only) ─────────────────────────────
router.post('/test/send', adminAuth, async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: 'Email address is required' });
    }
    
    const result = await sendTestEmail(email);
    
    if (result.success) {
      res.json({
        message: 'Test email sent successfully',
        messageId: result.messageId
      });
    } else {
      res.status(500).json({
        message: 'Failed to send test email',
        error: result.error
      });
    }
  } catch (error) {
    console.error('Send test email error:', error);
    res.status(500).json({ message: 'Failed to send test email' });
  }
});

// ── VERIFY email configuration (Admin only) ──────────────────
router.get('/test/verify', adminAuth, async (req, res) => {
  try {
    const result = await verifyEmailConfig();
    
    if (result.success) {
      res.json({ message: 'Email configuration is valid', status: 'OK' });
    } else {
      res.status(500).json({
        message: 'Email configuration error',
        error: result.error
      });
    }
  } catch (error) {
    console.error('Verify config error:', error);
    res.status(500).json({ message: 'Failed to verify configuration' });
  }
});

// ── PREVIEW template with sample data (Admin only) ───────────
router.post('/:id/preview', adminAuth, async (req, res) => {
  try {
    const db = getDB();
    const _id = toObjectId(req.params.id);
    const { sampleData } = req.body;
    
    if (!_id) {
      return res.status(400).json({ message: 'Invalid template ID' });
    }
    
    const template = await db.collection('emailTemplates').findOne({ _id });
    
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }
    
    // Replace variables with sample data
    let previewHtml = template.htmlBody;
    let previewSubject = template.subject;
    
    if (sampleData) {
      Object.keys(sampleData).forEach(key => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        previewHtml = previewHtml.replace(regex, sampleData[key]);
        previewSubject = previewSubject.replace(regex, sampleData[key]);
      });
    }
    
    res.json({
      subject: previewSubject,
      htmlBody: previewHtml,
      variables: template.variables
    });
  } catch (error) {
    console.error('Preview template error:', error);
    res.status(500).json({ message: 'Failed to preview template' });
  }
});

module.exports = router;
