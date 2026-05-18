import {
  buildScheduledRecordAlertEmail,
  collectScheduledRecordAlertTriggerSchedules,
  findScheduledRecordAlertMatches,
  isScheduledRecordAlertDue
} from '../../../src/services/webform/scheduledAlerts';

describe('scheduled record alerts', () => {
  const alert: any = {
    id: 'meal-production-lunch-incomplete',
    type: 'recordEmail',
    schedule: { hour: 13, minute: 0 },
    dateFieldId: 'MP_PREP_DATE',
    statusFieldId: 'Status',
    statusValues: ['In progress', 'In production'],
    filters: [{ fieldId: 'MP_SERVICE', equals: ['Lunch'] }],
    fields: {
      PRODUCTION_DATE: 'MP_PREP_DATE',
      CUSTOMER: 'MP_DISTRIBUTOR',
      SERVICE: 'MP_SERVICE',
      RESPONSIBLE_COOK: 'MP_COOK_NAME'
    },
    email: {
      recipients: ['ops@example.com'],
      subject: 'Meal Production report(s) not completed – action required',
      lineTemplate: '- {{PRODUCTION_DATE}}, {{CUSTOMER}}, {{SERVICE}} created by {{RESPONSIBLE_COOK}} is incomplete',
      message:
        'Meal Production record(s) for:\n\n{{RECORD_LINES}}\n\nPlease review, record all required information and photos to create and send the final report before {{TODAY_DATE}} midnight.\n\nRemember to record leftover(s) and generate ID(s) if applicable.'
    }
  };

  test('finds only today actionable status records matching the configured service', () => {
    const columns: any = {
      recordId: 6,
      status: 5,
      fields: {
        MP_PREP_DATE: 1,
        MP_SERVICE: 2,
        MP_DISTRIBUTOR: 3,
        MP_COOK_NAME: 4
      }
    };
    const rows = [
      ['2026-05-18', 'Lunch', 'Le Phare', 'Akkara', 'In progress', 'MP-1'],
      ['2026-05-18', 'Dinner', 'Le Phare', 'Akkara', 'In production', 'MP-2'],
      ['2026-05-17', 'Lunch', 'Le Phare', 'Akkara', 'In progress', 'MP-3'],
      ['2026-05-18', 'Lunch', 'Le Phare', 'Akkara', 'In production', 'MP-4'],
      ['2026-05-18', 'Lunch', 'Le Phare', 'Akkara', 'Closed', 'MP-5']
    ];

    const evaluation = findScheduledRecordAlertMatches({
      alert,
      form: { followupConfig: { statusFieldId: 'Status' } } as any,
      rows,
      columns,
      todayIso: '2026-05-18'
    });

    expect(evaluation.errors).toEqual([]);
    expect(evaluation.matches.map(match => match.recordId)).toEqual(['MP-1', 'MP-4']);
    expect(evaluation.matches[0]).toEqual(expect.objectContaining({ recordId: 'MP-1', status: 'In progress' }));
  });

  test('builds the configured email with formatted date lines', () => {
    const email = buildScheduledRecordAlertEmail({
      alert,
      todayIso: '2026-05-18',
      questions: [
        { id: 'MP_PREP_DATE', type: 'DATE' },
        { id: 'MP_SERVICE', type: 'CHOICE' },
        { id: 'MP_DISTRIBUTOR', type: 'TEXT' },
        { id: 'MP_COOK_NAME', type: 'TEXT' }
      ] as any,
      matches: [
        {
          rowNumber: 2,
          recordId: 'MP-1',
          status: 'In progress',
          values: {
            MP_PREP_DATE: '2026-05-18',
            MP_SERVICE: 'Lunch',
            MP_DISTRIBUTOR: 'Le Phare',
            MP_COOK_NAME: 'Akkara'
          }
        }
      ]
    });

    expect(email.subject).toBe('Meal Production report(s) not completed – action required');
    expect(email.body).toContain('- Mon, 18-May-2026, Le Phare, Lunch created by Akkara is incomplete');
    expect(email.body).toContain('before Mon, 18-May-2026 midnight');
  });

  test('detects due alerts and de-duplicates trigger schedules', () => {
    expect(isScheduledRecordAlertDue(alert, 13, 15)).toBe(true);
    expect(isScheduledRecordAlertDue(alert, 12, 59)).toBe(false);
    expect(
      collectScheduledRecordAlertTriggerSchedules([
        { scheduledAlerts: [alert, { ...alert, id: 'dinner', schedule: { hour: 17, minute: 0 } }] } as any,
        { scheduledAlerts: [{ ...alert, id: 'lunch-copy' }] } as any
      ])
    ).toEqual([
      { hour: 13, minute: 0 },
      { hour: 17, minute: 0 }
    ]);
  });
});
