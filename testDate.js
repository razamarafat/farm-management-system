const {format, startOfMonth, endOfMonth, subMonths} = require('date-fns-jalali');
const {jalaliToGregorian} = require('./src/utils/jalaliDate');
const today=new Date('2026-02-27');
console.log('jalali today', format(today,'yyyy/MM/dd'));
const start=startOfMonth(today);
console.log('startOfMonth', start.toISOString().split('T')[0]);
const prev = subMonths(start,1);
console.log('prev month start', prev.toISOString().split('T')[0]);
console.log('prev month end', endOfMonth(prev).toISOString().split('T')[0]);
