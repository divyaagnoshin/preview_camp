import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import pool from '../db/pool';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
router.use(authenticate);

// GET /telephony/sip-credentials
// Returns the SIP creds + FreeSWITCH WSS URL the browser softphone needs
// to register. Lazily provisions an extension/password the first time an
// agent calls this endpoint so existing user rows don't need backfilling.
//
// IMPORTANT: the returned extension/password must also exist on the
// FreeSWITCH side (in the directory). See README — FreeSWITCH setup.
router.get(
  '/sip-credentials',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;

      const { rows } = await pool.query(
        `SELECT id, sip_extension, sip_password FROM users WHERE id = $1`,
        [userId],
      );
      if (!rows[0]) throw new AppError(404, 'User not found');

      let { sip_extension, sip_password } = rows[0];

      if (!sip_extension || !sip_password) {
        sip_extension = `agent${userId.replace(/-/g, '').slice(0, 8)}`;
        sip_password = crypto.randomBytes(16).toString('hex');
        await pool.query(
          `UPDATE users SET sip_extension = $1, sip_password = $2 WHERE id = $3`,
          [sip_extension, sip_password, userId],
        );
      }

      // TURN relay config. When the agent's browser and FreeSWITCH live on
      // different NATs, ICE picks the agent's `srflx` (NAT-mapped) candidate
      // and FreeSWITCH sends RTP there \u2014 the return packets get dropped
      // by the agent's NAT and the call has one-way (or no) audio. A TURN
      // server fixes this by relaying RTP through a publicly reachable
      // endpoint both sides can hit.
      //
      // Set FS_TURN_URL (e.g. `turn:turn.example.com:3478?transport=udp`)
      // and FS_TURN_USERNAME / FS_TURN_PASSWORD to enable. Optionally set
      // FS_FORCE_TURN=true to force `iceTransportPolicy=relay` so the
      // browser only uses TURN candidates (useful when host/srflx routes
      // are known to be broken).
      const turn_url = process.env.FS_TURN_URL || '';
      const turn_username = process.env.FS_TURN_USERNAME || '';
      const turn_password = process.env.FS_TURN_PASSWORD || '';
      const force_turn =
        (process.env.FS_FORCE_TURN || '').toLowerCase() === 'true';

      res.json({
        extension: sip_extension,
        password: sip_password,
        sip_domain: process.env.FS_SIP_DOMAIN || '192.168.9.221',
        wss_url: process.env.FS_WSS_URL || 'wss://192.168.9.221:7443',
        stun_url: process.env.FS_STUN_URL || 'stun:stun.l.google.com:19302',
        turn_url,
        turn_username,
        turn_password,
        force_turn,
        caller_id_number:
          process.env.FS_OUTBOUND_CALLER_ID_NUMBER || '+10000000000',
        caller_id_name:
          process.env.FS_OUTBOUND_CALLER_ID_NAME || 'Preview Campaign',
        // Sent to the browser so the softphone can prepend whatever digits
        // the FreeSWITCH outbound dialplan expects (e.g. "0" for Indian
        // PSTN trunks). Empty string means dial the number as-is.
        dial_prefix: process.env.FS_DIAL_PREFIX || '',
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
