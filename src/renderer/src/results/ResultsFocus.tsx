import { createContext, useContext, type ReactNode } from 'react';

type Focus = (artifactId: string) => void;

const ResultsFocusContext = createContext<Focus>(() => undefined);

/** Lets anything in the chat bring an artifact to the front of the Results panel. */
export function ResultsFocusProvider({
  onFocus,
  children,
}: {
  onFocus: Focus;
  children: ReactNode;
}) {
  return <ResultsFocusContext value={onFocus}>{children}</ResultsFocusContext>;
}

export function useResultsFocus(): Focus {
  return useContext(ResultsFocusContext);
}
