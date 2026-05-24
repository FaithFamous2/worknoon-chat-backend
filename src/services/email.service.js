const { Resend } = require('resend');
const env = require('../config/env');

// Initialize Resend
const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

/**
 * Send email notification
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @param {string} options.text - Plain text content (optional)
 * @returns {Promise<Object>} Send result
 */
const sendEmail = async ({ to, subject, html, text }) => {
  if (!resend) {
    console.warn('Resend not configured. Email not sent.');
    return { success: false, error: 'Resend not configured' };
  }

  try {
    const result = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ''), // Strip HTML tags for text version
    });

    return { success: true, data: result };
  } catch (error) {
    console.error('Failed to send email:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send new message notification email
 * @param {Object} options
 * @param {string} options.to - Recipient email
 * @param {string} options.senderName - Name of the sender
 * @param {string} options.messageContent - Message content preview
 * @param {string} options.conversationId - Conversation ID
 * @param {string} options.conversationUrl - URL to open the conversation
 * @returns {Promise<Object>} Send result
 */
const sendNewMessageEmail = async ({
  to,
  senderName,
  messageContent,
  conversationId,
  conversationUrl,
}) => {
  const subject = `New message from ${senderName}`;
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #4f46e5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
        .message { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #4f46e5; }
        .button { display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 15px; }
        .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #6b7280; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>New Message</h1>
        </div>
        <div class="content">
          <p>Hello,</p>
          <p>You have received a new message from <strong>${senderName}</strong>:</p>
          <div class="message">
            <p>${messageContent.length > 200 ? messageContent.substring(0, 200) + '...' : messageContent}</p>
          </div>
          <a href="${conversationUrl}" class="button">View Message</a>
          <div class="footer">
            <p>This is an automated notification from Worknoon Chat.</p>
            <p>If you don't want to receive these emails, you can update your notification settings in your profile.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({ to, subject, html });
};

/**
 * Send chat assigned notification to agent
 * @param {Object} options
 * @param {string} options.to - Agent email
 * @param {string} options.customerName - Customer name
 * @param {string} options.conversationId - Conversation ID
 * @param {string} options.conversationUrl - URL to open the conversation
 * @returns {Promise<Object>} Send result
 */
const sendChatAssignedEmail = async ({
  to,
  customerName,
  conversationId,
  conversationUrl,
}) => {
  const subject = `New chat assigned: ${customerName}`;
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #10b981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 15px; }
        .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #6b7280; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>New Chat Assigned</h1>
        </div>
        <div class="content">
          <p>Hello,</p>
          <p>A new chat from <strong>${customerName}</strong> has been assigned to you.</p>
          <a href="${conversationUrl}" class="button">Accept Chat</a>
          <div class="footer">
            <p>This is an automated notification from Worknoon Chat.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({ to, subject, html });
};

/**
 * Send chat transfer notification
 * @param {Object} options
 * @param {string} options.to - Recipient email
 * @param {string} options.transferFrom - Name of the person transferring
 * @param {string} options.customerName - Customer name
 * @param {string} options.conversationId - Conversation ID
 * @param {string} options.conversationUrl - URL to open the conversation
 * @returns {Promise<Object>} Send result
 */
const sendChatTransferEmail = async ({
  to,
  transferFrom,
  customerName,
  conversationId,
  conversationUrl,
}) => {
  const subject = `Chat transferred: ${customerName}`;
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #f59e0b; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; background: #f59e0b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 15px; }
        .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #6b7280; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Chat Transferred</h1>
        </div>
        <div class="content">
          <p>Hello,</p>
          <p><strong>${transferFrom}</strong> has transferred a chat with <strong>${customerName}</strong> to you.</p>
          <a href="${conversationUrl}" class="button">View Chat</a>
          <div class="footer">
            <p>This is an automated notification from Worknoon Chat.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({ to, subject, html });
};

module.exports = {
  sendEmail,
  sendNewMessageEmail,
  sendChatAssignedEmail,
  sendChatTransferEmail,
};
