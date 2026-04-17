/**
 * Email Service using Nodemailer
 * Supports Zoho Mail and other SMTP providers
 */

const nodemailer = require('nodemailer');
const { getDB } = require('../db');

// Create transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.ZOHO_SMTP_HOST || 'smtp.zoho.com',
    port: process.env.ZOHO_SMTP_PORT || 465,
    secure: true, // true for 465, false for other ports
    auth: {
      user: process.env.ZOHO_EMAIL_USER, // Your Zoho email
      pass: process.env.ZOHO_EMAIL_PASSWORD, // Your Zoho password or app-specific password
    },
  });
};

// Get email template from database
const getTemplate = async (templateName) => {
  const db = getDB();
  const template = await db.collection('emailTemplates').findOne({ name: templateName });
  
  if (!template) {
    throw new Error(`Email template '${templateName}' not found`);
  }
  
  return template;
};

// Replace variables in template
const replaceVariables = (text, variables) => {
  if (!text) return '';
  
  let result = text;
  Object.keys(variables).forEach(key => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    result = result.replace(regex, variables[key] || '');
  });
  return result;
};

// Send email using template
const sendEmail = async (to, templateName, variables = {}) => {
  try {
    // Get template from database
    const template = await getTemplate(templateName);
    
    if (!template.isActive) {
      console.log(`Email template '${templateName}' is disabled`);
      return { success: false, message: 'Template is disabled' };
    }
    
    // Replace variables in subject and body
    const subject = replaceVariables(template.subject, variables);
    const htmlBody = replaceVariables(template.htmlBody, variables);
    const textBody = replaceVariables(template.textBody, variables);
    
    // Create transporter
    const transporter = createTransporter();
    
    // Email options
    const mailOptions = {
      from: `${process.env.EMAIL_FROM_NAME || 'Protein Spot'} <${process.env.ZOHO_EMAIL_USER}>`,
      to: to,
      subject: subject,
      text: textBody,
      html: htmlBody,
    };
    
    // Send email
    const info = await transporter.sendMail(mailOptions);
    
    console.log(`✅ Email sent: ${templateName} to ${to}`);
    console.log(`📧 Message ID: ${info.messageId}`);
    
    return {
      success: true,
      messageId: info.messageId,
      template: templateName,
      to: to,
    };
    
  } catch (error) {
    console.error(`❌ Email error (${templateName}):`, error.message);
    return {
      success: false,
      error: error.message,
      template: templateName,
      to: to,
    };
  }
};

// Send test email
const sendTestEmail = async (to) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: `${process.env.EMAIL_FROM_NAME || 'Protein Spot'} <${process.env.ZOHO_EMAIL_USER}>`,
      to: to,
      subject: 'Test Email - Protein Spot',
      text: 'This is a test email from Protein Spot. Your email configuration is working correctly!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2D8B4E;">✅ Email Configuration Test</h2>
          <p>This is a test email from <strong>Protein Spot</strong>.</p>
          <p>Your email configuration is working correctly!</p>
          <hr style="border: 1px solid #e0e0e0; margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">Sent from Protein Spot Email Service</p>
        </div>
      `,
    };
    
    const info = await transporter.sendMail(mailOptions);
    
    return {
      success: true,
      messageId: info.messageId,
      to: to,
    };
  } catch (error) {
    console.error('Test email error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

// Verify email configuration
const verifyEmailConfig = async () => {
  try {
    const transporter = createTransporter();
    await transporter.verify();
    console.log('✅ Email server is ready');
    return { success: true };
  } catch (error) {
    console.error('❌ Email configuration error:', error.message);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendEmail,
  sendTestEmail,
  verifyEmailConfig,
  getTemplate,
};
