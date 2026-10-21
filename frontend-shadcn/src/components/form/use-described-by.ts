import { useFormField } from '@/hooks/useForm';
import { useLayoutEffect, useState } from 'react';

/**
 * Builds the `aria-describedby` of a field control from the FormField context:
 * the hint (`descriptionId`, only when an element with that id is rendered, so no
 * dangling reference is emitted), the error (`errorId`, only while there is an error)
 * and any ids passed by the caller, deduplicated.
 */
export const useDescribedBy = () => {
  const ctx = useFormField();
  const [hasDescription, setHasDescription] = useState(false);

  // The hint may be rendered anywhere inside the FormField (by the caller, with
  // `descriptionId`): its presence is only known after commit, so it is read from the DOM.
  // No deps on purpose: the hint can appear or disappear on any render. No render loop:
  // setting the same boolean bails out.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    setHasDescription(!!document.getElementById(ctx.descriptionId));
  });

  return (hasError?: boolean, extra?: string) => {
    const ids = [
      hasDescription ? ctx.descriptionId : undefined,
      ...(extra?.split(/\s+/) ?? []),
      hasError ? ctx.errorId : undefined,
    ].filter((id): id is string => !!id);
    return ids.length > 0 ? Array.from(new Set(ids)).join(' ') : undefined;
  };
};
