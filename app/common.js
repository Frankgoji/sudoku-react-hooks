import React, {
    useEffect,
    useRef,
} from 'react';
import ReactDOM from 'react-dom';

/**
 * A custom hook for managing adding and removing event listeners
 * eventName - name of the event
 * element - element to add listeners on
 * shouldSet - bool to toggle if the event listener should be added
 * handler - the actual listener function
 */
export const useEventListener = (eventName, element, shouldSet, handler) => {
    const handlerRef = useRef();
    useEffect(() => {
        handlerRef.current = handler;
    }, [handler]);

    useEffect(() => {
        if (shouldSet) {
            const eventListener = (e) => handlerRef.current(e);
            element.addEventListener(eventName, eventListener);
            return () => {
                element.removeEventListener(eventName, eventListener);
            };
        }
    }, [eventName, element, shouldSet]);
};

/**
 * A custom hook to handle setInterval.
 * callback - the function to run at intervals
 * delay - the interval
 * shouldSet - optional boolean to control if interval should be set
 * callImmediately - boolean for if callback should be called immediately, default false
 */
export const useInterval = (callback, delay, shouldSet, callImmediately) => {
    const savedCallback = useRef();

    // Save the callback with the mutable pointer
    useEffect(() => {
        savedCallback.current = callback;
    }, [callback]);

    // Do setInterval
    useEffect(() => {
        function tick() {
            savedCallback.current();
        }
        if (delay !== null && (shouldSet === undefined || shouldSet)) {
            if (callImmediately) {
                tick();
            }
            const id = setInterval(tick, delay);
            return () => clearInterval(id);
        }
    }, [delay, shouldSet]);
};

/**
 * A generic class for the Controls box below the main content. Components can
 * pass the desired headers and contents for the controls.
 * Props:
 * headers - an array of objects that define the header buttons. Each object
 *     should look like so:
 *     {
 *         name: string
 *         id: string,
 *         onClick: function,
 *         disabled: boolean,
 *         className: string,
 *         liClassName: string
 *     }
 * contents - a dictionary of ids: function() that will return the content
 * selectedHeader - id of the header that is currently selected, '' if none
 */
export const Controls = (props) => {
    const selectedHeader = props.selectedHeader;
    const header = (
        <div className="header controls_contents">
            {props.headers.map((obj) => (
                <li key={obj.id} className={obj.liClassName}>
                    <button onClick={obj.onClick}
                            className={(obj.id === selectedHeader ? 'selected' : '') + ' ' + obj.className}
                            disabled={obj.disabled}>
                        {obj.name}
                    </button>
                </li>
            ))}
        </div>
    );
    return (
        <div className="controls">
            <div className="controls_box"></div>
            {header}
            {selectedHeader && (
                <div className="contents_box">
                    {props.contents[selectedHeader]()}
                </div>
            )}
        </div>
    );
};
