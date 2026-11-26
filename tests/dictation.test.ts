import {afterEach,describe,it,expect,vi} from 'vitest';
import {createDictation,speechError} from '../src/dictation';
class Speech {static last:Speech;lang='';continuous=false;interimResults=true;onstart:any;onend:any;onerror:any;onresult:any;start=vi.fn();stop=vi.fn();abort=vi.fn();constructor(){Speech.last=this;}}
function setup(){const cb={onText:vi.fn(),onError:vi.fn(),onListening:vi.fn()};const controller=createDictation(Speech,cb);controller.start();return {controller,r:Speech.last,cb};}
afterEach(()=>vi.useRealTimers());
describe('Dictado y fallos del navegador',()=>{
 it('explica el fallo de servicio en Brave sin culpar a Gemini',()=>{expect(speechError('network')).toContain('Brave');expect(speechError('network')).toContain('Chrome');});
 it.each(['not-allowed','audio-capture','no-speech','service-not-allowed','language-not-supported'])('distingue %s',code=>{expect(speechError(code)).not.toBe(speechError('unknown'));});
 it('escucha varias frases sin repetir los resultados acumulados',()=>{vi.useFakeTimers();const {r,cb,controller}=setup();r.onstart();expect(r.continuous).toBe(true);const a=Object.assign([{transcript:'Tengo papa'}],{isFinal:true}),b=Object.assign([{transcript:'y habas'}],{isFinal:true});r.onresult({resultIndex:0,results:[a]});r.onresult({resultIndex:0,results:[a,b]});expect(cb.onText.mock.calls).toEqual([['Tengo papa'],['y habas']]);controller.abort();});
 it('no agrega resultados provisionales',()=>{vi.useFakeTimers();const {r,cb,controller}=setup();r.onresult({results:[Object.assign([{transcript:'provisional'}],{isFinal:false})]});expect(cb.onText).not.toHaveBeenCalled();controller.abort();});
 it('el error no se reemplaza por otro al terminar',()=>{vi.useFakeTimers();const {r,cb}=setup();r.onerror({error:'network'});r.onend();expect(cb.onError).toHaveBeenCalledTimes(1);expect(cb.onListening).toHaveBeenLastCalledWith(false);});
 it('al detener conserva el último resultado y no muestra aborto como error',()=>{vi.useFakeTimers();const {r,cb,controller}=setup();controller.stop();r.onresult({results:[[{transcript:'10 kg'}]]});r.onerror({error:'aborted'});expect(cb.onText).toHaveBeenCalledWith('10 kg');expect(cb.onError).not.toHaveBeenCalled();});
 it('un inicio bloqueado no deja la interfaz escuchando',()=>{vi.useFakeTimers();const {r,cb}=setup();vi.advanceTimersByTime(12000);expect(r.abort).toHaveBeenCalled();expect(cb.onListening).toHaveBeenLastCalledWith(false);});
 it('el cierre sin voz explica cómo continuar',()=>{vi.useFakeTimers();const {r,cb}=setup();r.onend();expect(cb.onError).toHaveBeenCalledWith(expect.stringContaining('sin texto'));});
 it('captura el fallo síncrono del inicio',()=>{class Failing extends Speech{start=vi.fn(()=>{throw new Error('unavailable');});}const cb={onText:vi.fn(),onError:vi.fn(),onListening:vi.fn()};createDictation(Failing,cb).start();expect(cb.onError).toHaveBeenCalled();expect(cb.onListening).toHaveBeenLastCalledWith(false);});
});
