import { useCallback, useEffect, useLayoutEffect, useRef, type Dispatch, type SetStateAction } from 'react';

import type { FieldValue } from '../../../types';
import type { LineItemState } from '../../types';

export const useFormViewStateRefs = (args: {
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  collapsedRows: Record<string, boolean>;
  collapsedSubgroups: Record<string, boolean>;
  setValues: Dispatch<SetStateAction<Record<string, FieldValue>>>;
  setLineItems: Dispatch<SetStateAction<LineItemState>>;
}) => {
  const { values, lineItems, collapsedRows, collapsedSubgroups, setValues, setLineItems } = args;
  const valuesRef = useRef(values);
  const lineItemsRef = useRef(lineItems);
  const collapsedRowsRef = useRef(collapsedRows);
  const collapsedSubgroupsRef = useRef(collapsedSubgroups);

  const setValuesSynced = useCallback(
    (
      next:
        | Record<string, FieldValue>
        | ((prev: Record<string, FieldValue>) => Record<string, FieldValue>)
    ) => {
      const resolved = typeof next === 'function' ? next(valuesRef.current) : next;
      valuesRef.current = resolved;
      setValues(resolved);
    },
    [setValues]
  );

  const setLineItemsSynced = useCallback(
    (next: LineItemState | ((prev: LineItemState) => LineItemState)) => {
      const resolved = typeof next === 'function' ? next(lineItemsRef.current) : next;
      lineItemsRef.current = resolved;
      setLineItems(resolved);
    },
    [setLineItems]
  );

  useLayoutEffect(() => {
    valuesRef.current = values;
    lineItemsRef.current = lineItems;
  }, [values, lineItems]);

  useEffect(() => {
    collapsedRowsRef.current = collapsedRows;
    collapsedSubgroupsRef.current = collapsedSubgroups;
  }, [collapsedRows, collapsedSubgroups]);

  return {
    valuesRef,
    lineItemsRef,
    collapsedRowsRef,
    collapsedSubgroupsRef,
    setValuesSynced,
    setLineItemsSynced
  };
};
