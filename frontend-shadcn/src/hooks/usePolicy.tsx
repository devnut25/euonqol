import React, { type PropsWithChildren } from 'react';

export interface Authorization {
  view?: boolean;
  create?: boolean;
  update?: boolean;
  delete?: boolean;
}

interface PolicyProps extends PropsWithChildren {
  authorizations: Authorization;
}

export interface ContextProps {
  authorizations: Authorization;
}

export const PolicyContext = React.createContext<ContextProps | undefined>(undefined);

const defaultAuthorizations = {
  create: undefined,
  view: undefined,
  update: undefined,
  delete: undefined,
};

/**
 * Questo hook viene utilizzato per gestire
 * le autorizzazioni relative a un determinato elemento.
 * Seguiamo la stessa logica e il paradigma
 * utilizzato dalle policy di Laravel sui modelli.
 */
export const PolicyProvider = ({ authorizations, children }: PolicyProps) => {
  return (
    <PolicyContext.Provider
      value={{
        authorizations: {
          ...defaultAuthorizations,
          ...authorizations,
        },
      }}
    >
      {children}
    </PolicyContext.Provider>
  );
};

export const usePolicy = (): ContextProps => {
  const context = React.useContext(PolicyContext);
  if (!context)
    return {
      authorizations: defaultAuthorizations,
    };

  return context;
};
