/**
 * StudentFlow Cloudflare Worker: Secure OneSignal Web Push Proxy
 * 
 * - Acts as a proxy holding ONESIGNAL_REST_API_KEY securely.
 * - Schedules background push notifications via OneSignal REST API.
 * - Cancels scheduled notifications on task completion, edit, or deletion.
 * - Restricts CORS strictly to https://ramanshandilye-hub.github.io.
 * - Zero external npm dependencies.
 */

const ALLOWED_ORIGIN = 'https://ramanshandilye-hub.github.io';
const MAX_BODY_BYTES = 4096; // 4 KB max body
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TASK_ID_REGEX = /^[a-zA-Z0-9_\-]{1,80}$/;

/**
 * Standard JSON response helper with CORS headers
 */
function jsonResponse(data, status = 200, origin = ALLOWED_ORIGIN) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Idempotency-Key',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin'
    }
  });
}

/**
 * Generic error response helper
 */
function errorResponse(status, message, origin = ALLOWED_ORIGIN) {
  return jsonResponse({ error: message }, status, origin);
}

/**
 * Escape and sanitize plain text strings
 */
function sanitizeText(str, maxLength = 80) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/[<>]/g, '') // Strip basic HTML brackets
    .trim()
    .slice(0, maxLength);
}

/**
 * Build notification content based on stage and privacy settings
 */
function buildNotificationPayload(stage, title, hideTitle) {
  if (hideTitle) {
    if (stage === 'overdue') {
      return {
        heading: 'StudentFlow Reminder',
        content: '⚠️ You have an overdue assignment. Open StudentFlow to get back on track!'
      };
    }
    return {
      heading: 'StudentFlow Reminder',
      content: '⏰ You have an assignment due soon. Finish it to stay on track! 💪'
    };
  }

  const cleanTitle = title || 'Assignment';
  switch (stage) {
    case '24h':
      return {
        heading: '⏰ Due Tomorrow',
        content: `"${cleanTitle}" is due tomorrow. Plan ahead to finish strong! 📚`
      };
    case 'lead':
      return {
        heading: '⏰ Due Soon',
        content: `"${cleanTitle}" is due soon. Finish it now! 💪`
      };
    case '1h':
      return {
        heading: '⏳ Due in 1 Hour',
        content: `"${cleanTitle}" is due in 1 hour. Time for final touches! ⏳`
      };
    case 'overdue':
      return {
        heading: '⚠️ Assignment Overdue',
        content: `"${cleanTitle}" is overdue. Finish it to get back on track.`
      };
    case 'test':
      return {
        heading: '🔔 Test Notification',
        content: `Background reminders are active for "${cleanTitle}"! 🚀`
      };
    default:
      return {
        heading: '⏰ Assignment Reminder',
        content: `"${cleanTitle}" is due soon. Finish it now! 💪`
      };
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');

    // CORS preflight check
    if (request.method === 'OPTIONS') {
      if (origin === ALLOWED_ORIGIN) {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Idempotency-Key',
            'Access-Control-Max-Age': '86400',
            'Vary': 'Origin'
          }
        });
      }
      return new Response(null, { status: 403 });
    }

    // Enforce Origin security check
    if (origin !== ALLOWED_ORIGIN) {
      return new Response(JSON.stringify({ error: 'Forbidden origin' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const url = new URL(request.url);

    // Only POST requests are permitted
    if (request.method !== 'POST') {
      return errorResponse(405, 'Method not allowed');
    }

    // Verify secret configuration
    if (!env.ONESIGNAL_REST_API_KEY || !env.ONESIGNAL_APP_ID) {
      return errorResponse(500, 'Worker configuration error: OneSignal credentials missing');
    }

    // Body size validation
    const contentLength = parseInt(request.headers.get('Content-Length') || '0', 10);
    if (contentLength > MAX_BODY_BYTES) {
      return errorResponse(413, 'Payload too large (maximum 4 KB)');
    }

    let bodyText;
    try {
      bodyText = await request.text();
    } catch {
      return errorResponse(400, 'Failed to read request body');
    }

    if (bodyText.length > MAX_BODY_BYTES) {
      return errorResponse(413, 'Payload too large (maximum 4 KB)');
    }

    let payload;
    try {
      payload = JSON.parse(bodyText);
    } catch {
      return errorResponse(400, 'Invalid JSON body');
    }

    // ROUTE: POST /schedule
    if (url.pathname === '/schedule') {
      const { subscriptionId, taskId, stage, sendAt, title, url: clientUrl, hideTitle } = payload;

      // 1. Validate subscription ID (UUID)
      if (typeof subscriptionId !== 'string' || !UUID_REGEX.test(subscriptionId)) {
        return errorResponse(400, 'Invalid subscriptionId (must be valid UUID)');
      }

      // 2. Validate taskId
      if (typeof taskId !== 'string' || !TASK_ID_REGEX.test(taskId)) {
        return errorResponse(400, 'Invalid taskId');
      }

      // 3. Validate stage
      const validStages = ['24h', 'lead', '1h', 'overdue', 'test'];
      if (typeof stage !== 'string' || !validStages.includes(stage)) {
        return errorResponse(400, 'Invalid stage');
      }

      // 4. Validate sendAt date (must be in future and <= 30 days)
      if (typeof sendAt !== 'string') {
        return errorResponse(400, 'sendAt must be an ISO string');
      }
      const sendDate = new Date(sendAt);
      const sendTimestamp = sendDate.getTime();
      const now = Date.now();

      if (isNaN(sendTimestamp)) {
        return errorResponse(400, 'Invalid sendAt date format');
      }

      // Allow minimum 5 seconds buffer in future
      if (sendTimestamp <= now) {
        return errorResponse(400, 'sendAt must be in the future');
      }

      // Maximum 30 days in future per OneSignal REST API limits
      const maxFutureMs = 30 * 24 * 60 * 60 * 1000;
      if (sendTimestamp > now + maxFutureMs) {
        return errorResponse(400, 'sendAt cannot be more than 30 days in the future');
      }

      // 5. Sanitize title
      const cleanTitle = sanitizeText(title, 80);

      // 6. Build click URL targeting the specific task
      const targetHash = `#task-${encodeURIComponent(taskId)}`;
      let clickUrl = `${ALLOWED_ORIGIN}/studentflow/${targetHash}`;
      if (typeof clientUrl === 'string' && clientUrl.startsWith(ALLOWED_ORIGIN)) {
        clickUrl = clientUrl;
      }

      // 7. Compose text payload
      const { heading, content } = buildNotificationPayload(stage, cleanTitle, Boolean(hideTitle));

      // 8. Idempotency Key (taskId + stage + sendTimestamp)
      const idempotencyKey = `sf-${taskId}-${stage}-${sendTimestamp}`.slice(0, 128);

      // 9. Call OneSignal REST API to create scheduled notification
      const onesignalBody = {
        app_id: env.ONESIGNAL_APP_ID,
        include_subscription_ids: [subscriptionId],
        send_after: sendDate.toISOString(),
        headings: { en: heading },
        contents: { en: content },
        url: clickUrl,
        web_url: clickUrl,
        data: {
          taskId: taskId,
          stage: stage
        },
        chrome_web_icon: `${ALLOWED_ORIGIN}/studentflow/icon-192.png`,
        chrome_web_badge: `${ALLOWED_ORIGIN}/studentflow/icon-192.png`
      };

      try {
        const osRes = await fetch('https://api.onesignal.com/notifications', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Key ${env.ONESIGNAL_REST_API_KEY}`,
            'Idempotency-Key': idempotencyKey
          },
          body: JSON.stringify(onesignalBody)
        });

        const osData = await osRes.json();

        if (!osRes.ok || !osData.id) {
          // Log generic error without revealing secrets
          console.error('OneSignal scheduling error:', osRes.status, osData?.errors || 'Unknown error');
          return errorResponse(502, 'Failed to schedule notification via OneSignal');
        }

        return jsonResponse({
          messageId: osData.id,
          stage: stage,
          sendAt: sendDate.toISOString()
        });
      } catch (err) {
        console.error('Error connecting to OneSignal:', err.message);
        return errorResponse(502, 'OneSignal communication error');
      }
    }

    // ROUTE: POST /cancel
    if (url.pathname === '/cancel') {
      const { ids } = payload;

      // Validate ids array (max 12 per batch)
      if (!Array.isArray(ids) || ids.length === 0 || ids.length > 12) {
        return errorResponse(400, 'Invalid ids array (must be 1 to 12 message IDs)');
      }

      for (const id of ids) {
        if (typeof id !== 'string' || id.length > 64 || !/^[a-zA-Z0-9_\-]+$/.test(id)) {
          return errorResponse(400, 'Invalid message ID format');
        }
      }

      // Execute cancellations in parallel
      const cancelPromises = ids.map(async (messageId) => {
        try {
          const cancelUrl = `https://api.onesignal.com/notifications/${encodeURIComponent(messageId)}?app_id=${encodeURIComponent(env.ONESIGNAL_APP_ID)}`;
          const res = await fetch(cancelUrl, {
            method: 'DELETE',
            headers: {
              'Authorization': `Key ${env.ONESIGNAL_REST_API_KEY}`
            }
          });
          return res.ok;
        } catch {
          return false;
        }
      });

      const outcomes = await Promise.all(cancelPromises);
      const cancelledCount = outcomes.filter(Boolean).length;

      return jsonResponse({
        success: true,
        cancelled: cancelledCount
      });
    }

    return errorResponse(404, 'Endpoint not found');
  }
};
