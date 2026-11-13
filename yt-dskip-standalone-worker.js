// github: https://github.com/nep76/yt-dskip-standalone

const mMode = {
    OFF   : "OFF",
    MANUAL: "MANUAL",
    AUTO  : "AUTO"
};

const mSuspendAlarmName = "suspend_timer";
let mSuspendDelayMin    = 180;
let mIsSuspend          = false;

chrome.idle.setDetectionInterval( 30 );

async function init()
{
    const local   = await chrome.storage.local.get( [ "mode", "suspendDelay" ] );
    const session = await chrome.storage.session.get( "isSuspend" );

    if( ( ! Object.hasOwn( local, "mode" ) ) || ( ! Object.hasOwn( mMode, local.mode ) ) ){
        local.mode = mMode.OFF;
        await chrome.storage.local.set( { mode: local.mode } );
    }

    mSuspendDelayMin = local.suspendDelay ?? mSuspendDelayMin;
    mIsSuspend = session.isSuspend ?? false;

    const state = await new Promise( ( resolve ) => {
        chrome.idle.queryState( 30, resolve );
    } );
    await set_suspend_alarm_async( state );

    displayStatus( local.mode );
}

function displayStatus( mode )
{
    let text;
    let bgcolor;

    if( Object.hasOwn( mMode, mode ) ){
        if( mode === mMode.OFF ){
            text    = "";
            bgcolor = "#666666";
        } else{
            text    = mode.slice( 0, 3 );
            bgcolor = "#CC0000";
        }
    } else{
        throw( new Error( `Invalid status:${mode}` ) );
    }

    chrome.action.setBadgeText( { text: text } );
    chrome.action.setBadgeBackgroundColor( { color: bgcolor } );
}

async function set_suspend_alarm_async( state )
{
    const alarm = await chrome.alarms.get( mSuspendAlarmName );

    if( state === "active" ){
        if( alarm ){
            await chrome.alarms.clear( mSuspendAlarmName );
        }
        mIsSuspend = false;
        await chrome.storage.session.set( { isSuspend: mIsSuspend } );
    } else{
        if( ! mIsSuspend && ! alarm ){
            chrome.alarms.create( mSuspendAlarmName, {
                delayInMinutes: mSuspendDelayMin
            } );
        }
    }
}

async function setSkipMode( mode )
{
    let cur, prev_mode;

    if( ! Object.hasOwn( mMode, mode ) ){
        throw new Error( `Invalid mode specified: ${mode}` );
    }

    try{
        cur = await chrome.storage.local.get( "mode" );

        prev_mode = cur.mode;
        cur.mode  = mode;

        await chrome.storage.local.set( cur );
    } catch( e ){
        if( ! Object.hasOwn( mMode, cur.mode ) ){
            prev_mode = mMode.OFF;
            cur.mode  = mMode.OFF;
        }
        console.error( "Failed to read/write configuration", e );
    }

    if( cur.mode !== prev_mode ){
        try{
            if( cur.mode === mMode.AUTO || prev_mode === mMode.AUTO ){
                const manifest = chrome.runtime.getManifest();
                const urls = manifest.host_permissions;
                const tabs = await chrome.tabs.query( { url: urls } );

                if( cur.mode === mMode.AUTO ){
                    tabs.filter( ( tab ) => ! tab.discarded ).forEach( ( tab ) => {
                        chrome.tabs.sendMessage( tab.id, { msg: "cs.adskip.auto.start" } ).catch( () => {} );
                    } );
                } else{
                    tabs.filter( ( tab ) => ! tab.discarded ).forEach( ( tab ) => {
                        chrome.tabs.sendMessage( tab.id, { msg: "cs.adskip.auto.stop" } ).catch( () => {} );
                    } );
                }
            }
            displayStatus( cur.mode );
        } catch( e ){
            console.error( "Failed to send mode-change message.", e );
        }
    }

    return true;
}


chrome.alarms.onAlarm.addListener( async ( alarm ) => {
    await mInitPromise;

    if( alarm.name === mSuspendAlarmName ){
        mIsSuspend = true;
        await chrome.storage.session.set( { isSuspend: mIsSuspend } );
    }
} );

chrome.runtime.onMessage.addListener( ( msg, sender, response ) => {
    ( async () => {
        await mInitPromise;

        const rv = { success: true, params: null };

        switch( msg.msg ){
            case "sw.config.mode.get":{
                const pref = await chrome.storage.local.get( "mode" );
                rv.success = Object.hasOwn( mMode, pref.mode );
                rv.params  = pref.mode ?? mMode.OFF
                break;
            }
            case "sw.config.mode.set":{
                rv.success = await setSkipMode( msg.params ).catch( () => false );
                break;
            }
            case "sw.config.suspendDelay.get":{
                const pref = await chrome.storage.local.get( "suspendDelay" );
                rv.success = Object.hasOwn( pref, "suspendDelay" );
                rv.params  = pref.suspendDelay ?? mSuspendDelayMin;
                break;
            }
            case "sw.config.suspendDelay.set":{
                if( Number.isFinite( msg.params ) ){
                    if( msg.params < 5 ){
                        console.error( "Suspend timer interval is too short." );
                        rv.success = false;
                    } else{
                        mSuspendDelayMin = msg.params;
                        await chrome.storage.local.set( { suspendDelay: msg.params } );
                    }
                } else{
                    console.error( "Illegal value of suspend timer interval." );
                    rv.success = false;
                }
                break;
            }
            case "sw.signal.ready":{
                const pref = await chrome.storage.local.get( "mode" );
                if( pref.mode === mMode.AUTO ){
                    chrome.tabs.sendMessage( sender.tab.id, { msg: "cs.adskip.auto.start" } ).catch( ( e ) => {
                        console.error( "Failed to send cs.adskip.auto.start.", e );
                    } );
                }
                break;
            }
            case "sw.adskip.node.found": {
                if( mIsSuspend ) break;

                let attached = false;

                try{
                    await chrome.debugger.attach( { tabId: sender.tab.id }, "1.3" );

                    attached = true;
                    
                    await chrome.debugger.sendCommand(
                        { tabId: sender.tab.id },
                        "Input.dispatchMouseEvent",
                        {
                            type: "mousePressed",
                            x: msg.params.x,
                            y: msg.params.y,
                            button: "left",
                            clickCount: 1
                        }
                    );

                    await chrome.debugger.sendCommand(
                        { tabId: sender.tab.id },
                        "Input.dispatchMouseEvent",
                        {
                            type: "mouseReleased",
                            x: msg.params.x,
                            y: msg.params.y,
                            button: "left",
                            clickCount: 1
                        }
                    );
                } catch( e ){
                    throw new Error( "Failed to click skip.", { cause: e } );
                } finally{
                    if( attached ){
                        await chrome.debugger.detach( {
                            tabId: sender.tab.id
                        } ).catch( ( e ) => {
                            console.error( "Failed to detach debugger!", e );
                        } );
                    }
                }
                break;
            }
            case "sw.adskip.node.notfound":{
                break;
            }
            default:
                throw new Error( `Unknown message: ${msg.msg}` );
        }
        response( rv );
    } )().catch( ( e ) => {
        console.error( "Failed to handle message", e );
        response( { success: false } );
    } );

    return true;
} );

chrome.commands.onCommand.addListener( async ( command ) => {
    if( command === "do-skip" ){
        const tabs = await chrome.tabs.query( {
            active: true,
            lastFocusedWindow: true
        } );
        if( ! tabs.length ) return;

        for( const tab of tabs ){
            await chrome.tabs.sendMessage( tab.id, { msg: "cs.adskip.node.discover" } ).catch( ( e ) => {
                console.error( e );
            } );
        }
    }
} );

chrome.idle.onStateChanged.addListener( async ( state ) => {
    await set_suspend_alarm_async( state );
} );

const mInitPromise = init();
