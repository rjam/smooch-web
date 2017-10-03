import deepEqual from 'deep-equal';
import pick from 'lodash.pick';
import { batchActions } from 'redux-batched-actions';

import http from './http';

export const SET_USER = 'SET_USER';
export const UPDATE_USER = 'UPDATE_USER';
export const RESET_USER = 'RESET_USER';
export const RESET_PENDING_USER_PROPS = 'RESET_PENDING_USER_PROPS';
export const UPDATE_PENDING_USER_PROPS = 'UPDATE_PENDING_USER_PROPS';

let pendingUpdatePromise;
let pendingResolve;
let pendingTimeout;
let lastUpdateAttempt;

export const EDITABLE_PROPERTIES = [
    'givenName',
    'surname',
    'email',
    'signedUpAt',
    'properties'
];

export function immediateUpdate(props) {
    return (dispatch, getState) => {
        const {config: {appId, profile}, user, pendingUserProps} = getState();

        const updateToResolve = pendingResolve;
        if (pendingTimeout) {
            clearTimeout(pendingTimeout);
            pendingTimeout = null;
            pendingResolve = null;
        }

        lastUpdateAttempt = Date.now();

        props = pick(Object.assign({}, pendingUserProps, props), EDITABLE_PROPERTIES);

        const isDirty = Object.keys(props)
            .some((key) => !deepEqual(user[key], props[key]));

        if (isDirty && profile.enabled) {
            return dispatch(http('PUT', `/apps/${appId}/appusers/${user._id}`, props))
                .then(() => {
                    dispatch(batchActions([
                        resetPendingUserProps(),
                        setUser({
                            ...user,
                            ...props,
                            properties: {
                                ...user.properties,
                                ...props.properties
                            }
                        })]));

                    if (updateToResolve) {
                        updateToResolve(getState().user);
                    }

                    return getState().user;
                });
        } else if (updateToResolve) {
            updateToResolve(user);
            return pendingUpdatePromise;
        } else {
            return Promise.resolve(user);
        }
    };
}

export function update(props) {
    return (dispatch, getState) => {
        dispatch(updatePendingUserProps(props));

        if (!getState().user._id) {
            return Promise.resolve();
        }

        const waitDelay = getState().config.profile.uploadInterval * 1000;
        const timeNow = Date.now();
        const lastUpdateTime = lastUpdateAttempt || 0;

        if (pendingTimeout) {
            return pendingUpdatePromise;
        } else if ((timeNow - lastUpdateTime) > waitDelay) {
            return dispatch(immediateUpdate());
        } else {
            const timeToWait = waitDelay - (timeNow - lastUpdateTime);

            pendingUpdatePromise = new Promise(function(resolve) {
                pendingResolve = resolve;

                pendingTimeout = setTimeout(() => {
                    resolve(dispatch(immediateUpdate()));
                }, timeToWait);
            });

            return pendingUpdatePromise;
        }
    };
}

export function setUser(props) {
    return {
        type: SET_USER,
        user: props
    };
}

export function updateUser(properties) {
    return {
        type: UPDATE_USER,
        properties
    };
}

export function resetUser() {
    return {
        type: RESET_USER
    };
}

export function resetPendingUserProps() {
    return {
        type: RESET_PENDING_USER_PROPS
    };
}

export function updatePendingUserProps(props = {}) {
    return {
        type: UPDATE_PENDING_USER_PROPS,
        properties: pick(props, EDITABLE_PROPERTIES)
    };
}
