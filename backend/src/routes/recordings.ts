import { Router } from 'express';
import { agnoPool } from '../db/agnoPool';
import { body, query, validationResult } from 'express-validator';
import fs from 'fs';
import path from 'path';

const router = Router();

// GET /v1/recordings/list
router.get('/list',
  query('fromdate').isString().notEmpty(),
  query('todate').isString().notEmpty(),
  query('option').isString().notEmpty(),
  query('companyid').isString().notEmpty(),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { fromdate, todate, option, companyid } = req.query as {
    fromdate: string;
    todate: string;
    option: string;
    companyid: string;
  };

    // Add 1 day to todate because postgres "date" type strips time, 
    // and BETWEEN '2026-06-18' and '2026-06-18' only matches midnight.
    const toDateObj = new Date(todate);
    toDateObj.setDate(toDateObj.getDate() + 1);
    const toDateStr = toDateObj.toISOString().slice(0, 10);

    try {
      const result = await agnoPool.query(
        `SELECT * FROM report.recordingslist2($1, $2, $3, $4)`,
        [fromdate, toDateStr, option, companyid]
      );
      res.json(result.rows);
    } catch (error) {
      next(error);
    }
  }
);

// GET /v1/recordings/audio
router.get('/audio',
  query('uuid').isString().notEmpty(),
  query('date').isString().notEmpty(), // format: DD-MM-YYYY
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { uuid, date } = req.query as { uuid: string, date: string };

    try {
      let base64string = '';
      const parsedDate = date.split('-'); // DD, MM, YYYY
      if (parsedDate.length === 3) {
        const year = parsedDate[2];
        const month = parsedDate[1];
        const day = parsedDate[0];

        const basePath = process.env.RECORDING_PATH || 'E:/recordings/';
        // Ensure basePath doesn't end with a slash for clean joins
        const cleanBasePath = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;

        const fallbackPath1 = `${cleanBasePath}/${year}/${month}/${day}/${uuid}.wav`;
        const fallbackPath2 = `${cleanBasePath}/${uuid}.wav`;

        let targetPath = '';

        // Query the queuelog table (if it exists) like C# does
        let dbPath = '';
        try {
          const result = await agnoPool.query(`SELECT cc_record_filename FROM queuelog WHERE uuid = $1`, [uuid]);
          if (result.rows.length > 0) {
            dbPath = result.rows[0].cc_record_filename;
          }
        } catch (dbErr) {
          console.warn('Error querying queuelog:', dbErr);
        }

        if (dbPath && fs.existsSync(dbPath)) {
          targetPath = dbPath;
        } else if (fs.existsSync(fallbackPath1)) {
          targetPath = fallbackPath1;
        } else if (fs.existsSync(fallbackPath2)) {
          targetPath = fallbackPath2;
        }

        if (targetPath && fs.existsSync(targetPath)) {
            const fileData = fs.readFileSync(targetPath);
            base64string = fileData.toString('base64');
        }
      }

      res.json([{ val: base64string }]);
    } catch (error) {
      next(error);
    }
  }
);

// GET /v1/recordings/remarks
router.get('/remarks',
  query('uuid').isString().notEmpty(),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { uuid } = req.query as { uuid: string };

    try {
      const result = await agnoPool.query(
        `SELECT id, name, TO_CHAR(current_stamp,'YYYY-MM-DD') as date1, TO_CHAR(current_stamp,'HH24:mi:SS') as atime, remarks 
         FROM public.remarks 
         WHERE uuid = $1`,
        [uuid]
      );
      res.json(result.rows);
    } catch (error) {
      next(error);
    }
  }
);

// POST /v1/recordings/remark
router.post('/remark',
  body('select').isString().notEmpty(),
  body('text').isString().notEmpty(),
  body('company_id').isString().notEmpty(),
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    
    const { select: uuid, text, company_id } = req.body;

    try {
      await agnoPool.query(`UPDATE public.cdr SET remarks = $1 WHERE uuid = $2`, [text, uuid]);
      await agnoPool.query(
        `INSERT INTO public.remarks(name, current_stamp, remarks, uuid, company_id) 
         VALUES ('Admin', LOCALTIMESTAMP, $1, $2, $3)`,
        [text, uuid, company_id]
      );

      res.json([{ Status: "Success", Status_Description: "Inserted Successfully" }]);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
