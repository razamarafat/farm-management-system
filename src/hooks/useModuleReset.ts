import { useEffect, useRef } from 'react';
import { useUIStore } from '@/store/uiStore';

/*
A helper for pages that have nested "menu" state.
When `shouldRegister` is true the provided resetFn will be
stored in the UI store and the header will render a button
that invokes it.  The callback is cleared when the condition
becomes false or when the component unmounts.
*/
export function useModuleReset(
  shouldRegister: boolean,
  resetFn: () => void
) {
  const { registerModuleReset, clearModuleReset } = useUIStore();
  const resetFnRef = useRef(resetFn);

  // Always keep the ref in sync with the latest function
  useEffect(() => {
    resetFnRef.current = resetFn;
  }, [resetFn]);

  // Register or clear based on shouldRegister flag only
  useEffect(() => {
    if (shouldRegister) {
      registerModuleReset(() => resetFnRef.current());
    } else {
      clearModuleReset();
    }
    return () => {
      clearModuleReset();
    };
  }, [shouldRegister, registerModuleReset, clearModuleReset]);
}
