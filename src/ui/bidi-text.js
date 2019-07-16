const rtlChars = [
	/* arabic ranges*/
	'\u0600-\u06FF',
	'\u0750-\u077F',
	'\uFB50-\uFDFF',
	'\uFE70-\uFEFF',
	/* hebrew range*/
	'\u05D0-\u05FF'
];

const reRTL = new RegExp("[" + rtlChars.join("") + "]", "g");

function detectTextDir(text) {
	var textCount	= text.replace(/[0-9\s\\\/.,\-+="']/g, '').length; // remove multilengual characters from count
    var rtlCount	= (text.match(reRTL) || []).length,
        ltrCount    = textCount - rtlCount;
    return textCount > 0 && rtlCount >= ltrCount ? 'rtl' : 'ltr';
};

if (typeof module !== 'undefined')
    module.exports = {detectTextDir};
else if (typeof window !== undefined)
    window.detectTextDir = detectTextDir;
