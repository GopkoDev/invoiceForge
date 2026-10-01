// T19 (spec.md §1 change 5, §6 Dashboard parity): the old in-memory dashboard actions' output on the
// AC-05 fixture, recorded before they were deleted. Amounts are in cents; generated ids, names and tie
// order are left out (AC-05). The '*.records' keys name the records the sections picked, by fixture
// label (fixtureLabels() in harness.ts).
//
// Every key, the '*.records' keys included, was produced by snapshotDashboard() and fixtureLabels()
// in harness.ts run against the OLD dashboard actions (lib/actions/dashboard-actions.ts at commit
// ed84e76, the commit before T19 switched the wrappers to the layer), over seedParityFixture(), in a
// throwaway worktree. Re-review 2026-10-01 R-04 (T27): the records were first read from the new
// layer, so they could not prove old-vs-new parity; they were re-sourced from the old code and came
// out identical.
export const RECORDED_OLD_DASHBOARD: Record<string, unknown> = {
  "tabs": [
    "USD",
    "EUR"
  ],
  "USD.stats.dst": {
    "totalReceived": 123516,
    "receivedCount": 4,
    "totalPlanned": 61238,
    "plannedCount": 3,
    "totalOverdue": 15100,
    "overdueCount": 2,
    "allFuturePayments": 188339,
    "allFuturePaymentsCount": 11
  },
  "USD.chart.dst": [
    [
      "2026-03-25",
      30,
      30
    ],
    [
      "2026-03-26",
      30,
      30
    ],
    [
      "2026-03-27",
      30,
      30
    ],
    [
      "2026-03-28",
      30,
      30
    ],
    [
      "2026-03-29",
      60,
      30
    ],
    [
      "2026-03-30",
      123516,
      50035
    ],
    [
      "2026-03-31",
      123516,
      51269
    ],
    [
      "2026-04-01",
      123516,
      51269
    ],
    [
      "2026-04-02",
      123516,
      61268
    ]
  ],
  "USD.senders.dst": [
    {
      "received": 123516,
      "planned": 76338,
      "future": 188339,
      "accounts": [
        [
          123516,
          76338
        ]
      ]
    }
  ],
  "USD.stats.weekly": {
    "totalReceived": 126032,
    "receivedCount": 6,
    "totalPlanned": 61238,
    "plannedCount": 3,
    "totalOverdue": 27100,
    "overdueCount": 7,
    "allFuturePayments": 188339,
    "allFuturePaymentsCount": 11
  },
  "USD.chart.weekly": [
    [
      "2026-02-01",
      0,
      0
    ],
    [
      "2026-02-08",
      0,
      0
    ],
    [
      "2026-02-15",
      0,
      0
    ],
    [
      "2026-02-22",
      0,
      0
    ],
    [
      "2026-03-01",
      0,
      0
    ],
    [
      "2026-03-08",
      2516,
      2516
    ],
    [
      "2026-03-15",
      2516,
      2516
    ],
    [
      "2026-03-22",
      2546,
      2546
    ],
    [
      "2026-03-29",
      126032,
      63784
    ],
    [
      "2026-04-05",
      126032,
      63784
    ],
    [
      "2026-04-12",
      126032,
      63784
    ],
    [
      "2026-04-19",
      126032,
      63784
    ],
    [
      "2026-04-26",
      126032,
      63784
    ]
  ],
  "USD.senders.weekly": [
    {
      "received": 124517,
      "planned": 88338,
      "future": 188339,
      "accounts": [
        [
          124517,
          88338
        ]
      ]
    },
    {
      "received": 1515,
      "planned": 0,
      "future": 0,
      "accounts": [
        [
          1515,
          0
        ]
      ]
    }
  ],
  "USD.stats.all": {
    "totalReceived": 126032,
    "receivedCount": 6,
    "totalPlanned": 161239,
    "plannedCount": 4,
    "totalOverdue": 27100,
    "overdueCount": 7,
    "allFuturePayments": 188339,
    "allFuturePaymentsCount": 11
  },
  "USD.senders.all": [
    {
      "received": 124517,
      "planned": 188339,
      "future": 188339,
      "accounts": [
        [
          124517,
          188339
        ]
      ]
    },
    {
      "received": 1515,
      "planned": 0,
      "future": 0,
      "accounts": [
        [
          1515,
          0
        ]
      ]
    }
  ],
  "USD.recent": [
    [
      1515,
      "PAID",
      "USD",
      "2026-03-12T09:00:00.000Z",
      null
    ],
    [
      1234,
      "PENDING",
      "USD",
      "2026-03-20T09:00:00.000Z",
      "2026-03-31T09:00:00.000Z"
    ],
    [
      3000,
      "OVERDUE",
      "USD",
      "2026-03-05T09:00:00.000Z",
      "2026-03-23T09:00:00.000Z"
    ],
    [
      2990,
      "OVERDUE",
      "USD",
      "2026-03-05T09:00:00.000Z",
      "2026-03-22T09:00:00.000Z"
    ],
    [
      10,
      "OVERDUE",
      "USD",
      "2026-03-05T09:00:00.000Z",
      "2026-03-22T09:00:00.000Z"
    ],
    [
      4000,
      "OVERDUE",
      "USD",
      "2026-03-06T09:00:00.000Z",
      "2026-03-21T09:00:00.000Z"
    ],
    [
      2000,
      "OVERDUE",
      "USD",
      "2026-03-04T09:00:00.000Z",
      "2026-03-20T09:00:00.000Z"
    ],
    [
      100001,
      "PENDING",
      "USD",
      "2026-03-20T09:00:00.000Z",
      "2026-09-01T09:00:00.000Z"
    ],
    [
      999900,
      "DRAFT",
      "USD",
      "2026-03-26T09:00:00.000Z",
      "2026-03-31T09:00:00.000Z"
    ],
    [
      7550,
      "OVERDUE",
      "USD",
      "2026-03-02T09:00:00.000Z",
      "2026-03-27T09:00:00.000Z"
    ]
  ],
  "USD.debtors": [
    [
      15100,
      2,
      [
        "USD"
      ]
    ],
    [
      6000,
      2,
      [
        "USD"
      ]
    ],
    [
      3000,
      2,
      [
        "USD"
      ]
    ]
  ],
  "USD.expected": [
    {
      "currency": "USD",
      "total": 161239,
      "count": 4,
      "invoices": [
        [
          50005,
          "2026-03-30T09:00:00.000Z"
        ],
        [
          1234,
          "2026-03-31T09:00:00.000Z"
        ],
        [
          9999,
          "2026-04-01T21:30:00.000Z"
        ]
      ]
    }
  ],
  "EUR.stats.dst": {
    "totalReceived": 25025,
    "receivedCount": 1,
    "totalPlanned": 880,
    "plannedCount": 1,
    "totalOverdue": 4000,
    "overdueCount": 1,
    "allFuturePayments": 4880,
    "allFuturePaymentsCount": 2
  },
  "EUR.chart.dst": [
    [
      "2026-03-25",
      0,
      0
    ],
    [
      "2026-03-26",
      0,
      0
    ],
    [
      "2026-03-27",
      25025,
      25025
    ],
    [
      "2026-03-28",
      25025,
      25025
    ],
    [
      "2026-03-29",
      25025,
      25025
    ],
    [
      "2026-03-30",
      25025,
      25905
    ],
    [
      "2026-03-31",
      25025,
      25905
    ],
    [
      "2026-04-01",
      25025,
      25905
    ],
    [
      "2026-04-02",
      25025,
      25905
    ]
  ],
  "EUR.senders.dst": [
    {
      "received": 25025,
      "planned": 4880,
      "future": 4880,
      "accounts": [
        [
          25025,
          4880
        ]
      ]
    }
  ],
  "EUR.stats.weekly": {
    "totalReceived": 25025,
    "receivedCount": 1,
    "totalPlanned": 880,
    "plannedCount": 1,
    "totalOverdue": 4000,
    "overdueCount": 1,
    "allFuturePayments": 4880,
    "allFuturePaymentsCount": 2
  },
  "EUR.chart.weekly": [
    [
      "2026-02-01",
      0,
      0
    ],
    [
      "2026-02-08",
      0,
      0
    ],
    [
      "2026-02-15",
      0,
      0
    ],
    [
      "2026-02-22",
      0,
      0
    ],
    [
      "2026-03-01",
      0,
      0
    ],
    [
      "2026-03-08",
      0,
      0
    ],
    [
      "2026-03-15",
      0,
      0
    ],
    [
      "2026-03-22",
      25025,
      25025
    ],
    [
      "2026-03-29",
      25025,
      25905
    ],
    [
      "2026-04-05",
      25025,
      25905
    ],
    [
      "2026-04-12",
      25025,
      25905
    ],
    [
      "2026-04-19",
      25025,
      25905
    ],
    [
      "2026-04-26",
      25025,
      25905
    ]
  ],
  "EUR.senders.weekly": [
    {
      "received": 25025,
      "planned": 4880,
      "future": 4880,
      "accounts": [
        [
          25025,
          4880
        ]
      ]
    }
  ],
  "EUR.stats.all": {
    "totalReceived": 25025,
    "receivedCount": 1,
    "totalPlanned": 880,
    "plannedCount": 1,
    "totalOverdue": 4000,
    "overdueCount": 1,
    "allFuturePayments": 4880,
    "allFuturePaymentsCount": 2
  },
  "EUR.senders.all": [
    {
      "received": 25025,
      "planned": 4880,
      "future": 4880,
      "accounts": [
        [
          25025,
          4880
        ]
      ]
    }
  ],
  "EUR.recent": [
    [
      880,
      "PENDING",
      "EUR",
      "2026-03-20T09:00:00.000Z",
      "2026-03-30T09:00:00.000Z"
    ],
    [
      4000,
      "OVERDUE",
      "EUR",
      "2026-03-03T09:00:00.000Z",
      "2026-03-28T09:00:00.000Z"
    ],
    [
      25025,
      "PAID",
      "EUR",
      "2026-03-27T09:00:00.000Z",
      null
    ]
  ],
  "EUR.debtors": [
    [
      4000,
      1,
      [
        "EUR"
      ]
    ]
  ],
  "EUR.expected": [
    {
      "currency": "EUR",
      "total": 880,
      "count": 1,
      "invoices": [
        [
          880,
          "2026-03-30T09:00:00.000Z"
        ]
      ]
    }
  ],
  "USD.senders.dst.records": [
    {
      "sender": "Test Sender Profile",
      "accounts": [
        "Test Bank/Test Freelancer/USD"
      ]
    }
  ],
  "USD.senders.weekly.records": [
    {
      "sender": "0 Other Profile",
      "accounts": [
        "Other Bank/Other Holder/USD"
      ]
    },
    {
      "sender": "Test Sender Profile",
      "accounts": [
        "Test Bank/Test Freelancer/USD"
      ]
    }
  ],
  "USD.senders.all.records": [
    {
      "sender": "0 Other Profile",
      "accounts": [
        "Other Bank/Other Holder/USD"
      ]
    },
    {
      "sender": "Test Sender Profile",
      "accounts": [
        "Test Bank/Test Freelancer/USD"
      ]
    }
  ],
  "USD.recent.records": [
    "0 Other Profile#000001",
    "Test Sender Profile#000019",
    "Test Sender Profile#000018",
    "Test Sender Profile#000017",
    "Test Sender Profile#000016",
    "Test Sender Profile#000015",
    "Test Sender Profile#000014",
    "Test Sender Profile#000011",
    "Test Sender Profile#000010",
    "Test Sender Profile#000009"
  ],
  "USD.debtors.records": [
    "1 Customer",
    "2 Second Customer",
    "3 Third Customer"
  ],
  "USD.expected.records": [
    [
      "Test Sender Profile#000006",
      "Test Sender Profile#000019",
      "Test Sender Profile#000007"
    ]
  ],
  "EUR.senders.dst.records": [
    {
      "sender": "Test Sender Profile",
      "accounts": [
        "Test Bank/Test Freelancer/EUR"
      ]
    }
  ],
  "EUR.senders.weekly.records": [
    {
      "sender": "Test Sender Profile",
      "accounts": [
        "Test Bank/Test Freelancer/EUR"
      ]
    }
  ],
  "EUR.senders.all.records": [
    {
      "sender": "Test Sender Profile",
      "accounts": [
        "Test Bank/Test Freelancer/EUR"
      ]
    }
  ],
  "EUR.recent.records": [
    "Test Sender Profile#000020",
    "Test Sender Profile#000013",
    "Test Sender Profile#000012"
  ],
  "EUR.debtors.records": [
    "1 Customer"
  ],
  "EUR.expected.records": [
    [
      "Test Sender Profile#000020"
    ]
  ]
};
