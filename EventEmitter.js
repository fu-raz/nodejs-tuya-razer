const BaseClass = require("./BaseClass");

module.exports = class EventEmitter extends BaseClass
{
    constructor()
    {
        super();
        this.events = {};
        this.anyEvents = [];
        this.singleEvents = {};
    }

    on(eventName, callback)
    {
        if (!this.events[eventName])
        {
            this.events[eventName] = [];
        }
        this.events[eventName].push(callback);
    }

    onAny(callback)
    {
        this.anyEvents.push(callback);
    }

    once(eventName, callback)
    {
        if (!this.singleEvents[eventName])
        {
            this.singleEvents[eventName] = [];
        }
        this.singleEvents[eventName].push(callback);
    }

    trigger(eventName)
    {
        if (this.events)
        {
            // First do all of the `onAny` events
            if (this.anyEvents.length > 0)
            {
                this.anyEvents.forEach((callback) => {
                    callback.apply(this, arguments);
                });
            }

            // Do the `on` events
            let events = this.events[eventName];
            if (events && events.length > 0)
            {
                [].shift.apply(arguments);
                events.forEach((callback) => {
                    callback.apply(this, arguments); // 'This' should get ignored by binded functions
                });
            }

            // Do the `once` events
            let oneTimeEvents = this.singleEvents[eventName];
            if (oneTimeEvents && oneTimeEvents.length > 0)
            {
                [].shift.apply(arguments);
                oneTimeEvents.forEach((callback) => {
                    callback.apply(this, arguments); // 'This' should get ignored by binded functions
                });
            }
        }
    }

}