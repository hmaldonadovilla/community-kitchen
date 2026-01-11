import React from 'react';
import type { ListViewRuleIcon } from '../../types';

export const ListViewIcon: React.FC<{ name: ListViewRuleIcon }> = ({ name }) => {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    'aria-hidden': true,
    focusable: false as any,
    className: `ck-list-icon ck-list-icon--${name}`
  };

  switch (name) {
    case 'warning':
      return (
        <svg {...common}>
          <path
            d="M12 3.5 2.8 20a1.2 1.2 0 0 0 1.05 1.8h16.3A1.2 1.2 0 0 0 21.2 20L12 3.5Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M12 9v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M12 17.5h.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      );
    case 'check':
      return (
        <svg {...common}>
          <path
            d="M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M8.5 12.5 11 15l4.5-5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'error':
      return (
        <svg {...common}>
          <path
            d="M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M15 9 9 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M9 9l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'info':
      return (
        <svg {...common}>
          <path
            d="M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M12 16v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M12 8h.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      );
    case 'external':
      return (
        <svg {...common}>
          <path d="M14 3h7v7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10 14 21 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path
            d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'lock':
      return (
        <svg {...common}>
          <path
            d="M17 11H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M8 11V8a4 4 0 1 1 8 0v3"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'edit':
      return (
        <svg {...common}>
          <path
            d="M12 20h9"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'view':
      return (
        <svg {...common}>
          <path
            d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'copy':
      return (
        <svg {...common}>
          <path
            d="M9 9h10a2 2 0 0 1 2 2v10"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M5 15V5a2 2 0 0 1 2-2h10v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      );
    default:
      return null;
  }
};


