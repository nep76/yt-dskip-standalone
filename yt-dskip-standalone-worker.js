// github: https://github.com/nep76/yt-dskip-standalone

const mMode = {
    OFF   : "OFF",
    MANUAL: "MANUAL",
    AUTO  : "AUTO"
};

const mSuspendAlarmName = "suspend_timer";
const mSuspendDelayMin  = 180;

let mIsSuspend = false;

chrome.idle.setDetectionInterval( 30 );

async function init()
{
    const pref = await chrome.storage.local.get( "mode" );

    chrome.idle.queryState( 30, ( state ) => {
        set_suspend_alarm( state );
    } );

    if( ( ! Object.hasOwn( pref, "mode" ) ) || ( ! Object.hasOwn( mMode, pref.mode ) ) ){
        pref.mode = mMode.OFF;
        await chrome.storage.local.set( { mode: pref.mode } );
    }

    displayStatus( pref.mode );
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

function set_suspend_alarm( state )
{
    if( state === "active" ){
        chrome.alarms.clear( mSuspendAlarmName );
        mIsSuspend = false;
    } else{
        chrome.alarms.create( mSuspendAlarmName, {
            delayInMinutes: mSuspendDelayMin
        } );
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
                const urls = manifest.content_scripts.flatMap( script => script.matches );
                const tabs = await chrome.tabs.query( { url: urls } );

                if( cur.mode === mMode.AUTO ){
                    tabs.filter( ( tab ) => ! tab.discarded ).forEach( ( tab ) => {
                        chrome.tabs.sendMessage( tab.id, { msg: "AUTO_SKIP_START" } ).catch( () => {} );
                    } );
                } else{
                    tabs.filter( ( tab ) => ! tab.discarded ).forEach( ( tab ) => {
                        chrome.tabs.sendMessage( tab.id, { msg: "AUTO_SKIP_STOP" } ).catch( () => {} );
                    } );
                }
            }
            displayStatus( cur.mode );
        } catch( e ){
            console.error( "Failed to send message of mode change.", e );
        }
    }

    return true;
}


chrome.alarms.onAlarm.addListener( ( alarm ) => {
    if( alarm.name === mSuspendAlarmName ){
        mIsSuspend = true;
    }
} );

chrome.runtime.onMessage.addListener( async ( msg, sender, response ) => {
    switch( msg.msg ){
        case "GET_MODE":{
            const pref = await chrome.storage.local.get( "mode" );
            response( { success: Object.hasOwn( mMode, pref.mode ), params: pref.mode ?? mMode.OFF } );
            return true;
        }
        case "SET_MODE":{
            const retv = await setSkipMode( msg.params ).catch( () => false );
            response( { success: retv } );
            return true;
        }
        case "READY":{
            const pref = await chrome.storage.local.get( "mode" );
            if( pref.mode === mMode.AUTO ){
                chrome.tabs.sendMessage( sender.tab.id, { msg: "AUTO_SKIP_START" } ).catch( ( e ) => {
                    console.error( "Failed to send AUTO_SKIP_START.", e );
                } );
            }
            break;
        }
        case "SKIPNODE_FOUND": {
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
                console.error( "Failed to click skip.", e );
            } finally{
                if( attached ){
                    await chrome.debugger.detach( { tabId: sender.tab.id } ).catch( () => {} );
                }
            }
            break;
        } 
    }
} );

chrome.commands.onCommand.addListener( async ( command ) => {
    if( command === "do-skip" ){
        const tabs = await chrome.tabs.query( {
            active: true,
            lastFocusedWindow: true
        } );
        if( ! tabs.length ) return;

        for( const tab of tabs ){
            await chrome.tabs.sendMessage( tab.id, { msg: "SKIPNODE_REQUEST" } ).catch( ( e ) => {
                console.error( e );
            } );
        }
    }
} );

chrome.idle.onStateChanged.addListener( ( state ) => {
    set_suspend_alarm( state );
} );

chrome.runtime.onInstalled.addListener( init );
chrome.runtime.onStartup.addListener( init );

chrome.idle.queryState( 30, ( state ) => {
    set_suspend_alarm( state );
} );
