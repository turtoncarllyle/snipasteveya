export interface OcrState { text:string; error:string; job:string | null; status:"idle" | "running" | "done" | "cancelled" | "error"; engine:string }
export const initialOcrState: OcrState = {text:"",error:"",job:null,status:"idle",engine:""};
export type OcrAction = {type:"start";job:string} | {type:"success";job:string;text:string;engine:string} | {type:"failure";job:string;error:string} | {type:"cancel";job:string} | {type:"edit";text:string};
export function ocrReducer(state: OcrState, action: OcrAction): OcrState {
  if (action.type === "edit") return {...state,text:action.text};
  if (action.type === "start") return {...state,job:action.job,status:"running",error:""};
  if (action.job !== state.job) return state;
  if (action.type === "success") return {...state,text:action.text,engine:action.engine,job:null,status:"done",error:""};
  if (action.type === "failure") return {...state,job:null,status:"error",error:action.error};
  return {...state,job:null,status:"cancelled",error:""};
}
