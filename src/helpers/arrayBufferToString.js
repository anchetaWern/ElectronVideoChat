const arrayBufferToString = buf => {
	return String.fromCharCode.apply(null, new Uint16Array(buf));
};

export default arrayBufferToString;
