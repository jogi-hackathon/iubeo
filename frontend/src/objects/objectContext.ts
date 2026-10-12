import {createContext, useContext} from "react";

export type ObjectState = {
  visible: boolean;
  enabled: boolean;
};

export const ObjectStateContext = createContext<ObjectState>({
  visible: true,
  enabled: true,
});

export const useObjectState = (): ObjectState => useContext(ObjectStateContext);
