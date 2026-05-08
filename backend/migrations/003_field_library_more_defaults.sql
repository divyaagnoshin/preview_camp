-- Additional default columns for the org_field_library.
-- All seeded as global rows (org_id IS NULL = "Allowed To All").
-- ON CONFLICT DO NOTHING relies on the partial unique index uq_field_library_global_key.

INSERT INTO org_field_library
  (org_id, name, field_key, field_type, data_type,
   is_private, is_read_only_agent, is_masked_agent, is_masked_reports, display_order)
VALUES
  -- Predefined STRING fields
  (NULL, 'Country Predefined',                  'country_predefined',                  'predefined', 'STRING',    FALSE, FALSE, FALSE, FALSE, 22),
  (NULL, 'Zipcode Predefined',                  'zipcode_predefined',                  'predefined', 'STRING',    FALSE, FALSE, FALSE, FALSE, 23),
  (NULL, 'Phone 1 State',                       'phone_1_state',                       'predefined', 'STRING',    FALSE, FALSE, FALSE, FALSE, 24),
  (NULL, 'Phone 2 State',                       'phone_2_state',                       'predefined', 'STRING',    FALSE, FALSE, FALSE, FALSE, 25),
  (NULL, 'Phone 1 Allowed Time',                'phone_1_allowed_time',                'predefined', 'STRING',    FALSE, FALSE, FALSE, FALSE, 26),
  (NULL, 'Phone 1 Disallowed Time',             'phone_1_disallowed_time',             'predefined', 'STRING',    FALSE, FALSE, FALSE, FALSE, 27),
  (NULL, 'Phone 2 Allowed Time',                'phone_2_allowed_time',                'predefined', 'STRING',    FALSE, FALSE, FALSE, FALSE, 28),
  (NULL, 'Phone 2 Disallowed Time',             'phone_2_disallowed_time',             'predefined', 'STRING',    FALSE, FALSE, FALSE, FALSE, 29),
  (NULL, 'Zipcode Time Zone Predefined',        'zipcode_time_zone_predefined',        'predefined', 'STRING',    FALSE, FALSE, FALSE, FALSE, 30),
  (NULL, 'Zipcode State Predefined',            'zipcode_state_predefined',            'predefined', 'STRING',    FALSE, FALSE, FALSE, FALSE, 31),
  (NULL, 'Zipcode1 Predefined',                 'zipcode1_predefined',                 'predefined', 'STRING',    FALSE, FALSE, FALSE, FALSE, 32),
  (NULL, 'Zipcode1 Time Zone Predefined',       'zipcode1_time_zone_predefined',       'predefined', 'STRING',    FALSE, FALSE, FALSE, FALSE, 33),
  (NULL, 'Zipcode1 State Predefined',           'zipcode1_state_predefined',           'predefined', 'STRING',    FALSE, FALSE, FALSE, FALSE, 34),
  (NULL, 'Last Address Dialed Attribute Name',  'last_address_dialed_attribute_name',  'predefined', 'STRING',    FALSE, FALSE, FALSE, FALSE, 35),
  (NULL, 'Last Handled By AgentId',             'last_handled_by_agent_id',            'predefined', 'STRING',    FALSE, FALSE, FALSE, FALSE, 36),
  (NULL, 'System AgentID',                      'system_agent_id',                     'predefined', 'STRING',    FALSE, FALSE, FALSE, FALSE, 37),
  -- Predefined BOOLEAN fields
  (NULL, 'Phone 1 Wireless',                    'phone_1_wireless',                    'predefined', 'BOOLEAN',   FALSE, FALSE, FALSE, FALSE, 38),
  (NULL, 'Phone 2 Wireless',                    'phone_2_wireless',                    'predefined', 'BOOLEAN',   FALSE, FALSE, FALSE, FALSE, 39),
  -- Predefined TIMESTAMP fields
  (NULL, 'Last Nuisance Call Time',             'last_nuisance_call_time',             'predefined', 'TIMESTAMP', FALSE, FALSE, FALSE, FALSE, 40),
  (NULL, 'Last Modified On',                    'last_modified_on',                    'predefined', 'TIMESTAMP', FALSE, FALSE, FALSE, FALSE, 41),
  (NULL, 'Added On',                            'added_on',                            'predefined', 'TIMESTAMP', FALSE, FALSE, FALSE, FALSE, 42),
  -- Predefined INTEGER fields
  (NULL, 'Counter',                             'counter',                             'predefined', 'INTEGER',   FALSE, FALSE, FALSE, FALSE, 43),
  -- Custom fields (seeded globally as part of the default library)
  (NULL, 'Custom_Balance',                      'custom_balance',                      'custom',     'FLOAT',     FALSE, FALSE, FALSE, FALSE, 44),
  (NULL, 'Custom_Address',                      'custom_address',                      'custom',     'LONG',      FALSE, FALSE, FALSE, FALSE, 45),
  (NULL, 'Custom_TicketID',                     'custom_ticketid',                     'custom',     'INTEGER',   FALSE, FALSE, FALSE, FALSE, 46),
  (NULL, 'Custom_AccountNumber',                'custom_accountnumber',                'custom',     'INTEGER',   FALSE, FALSE, FALSE, FALSE, 47),
  (NULL, 'Custom_PaymentTime',                  'custom_paymenttime',                  'custom',     'TIMESTAMP', FALSE, FALSE, FALSE, FALSE, 48)
ON CONFLICT DO NOTHING;
