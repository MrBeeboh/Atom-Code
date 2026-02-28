import { diffLines } from 'diff';

self.onmessage = async (e) => {
    const { originalCode, modifiedCode, id } = e.data;

    try {
        const orig = originalCode ?? '';
        const mod = modifiedCode ?? '';
        const parts = diffLines(orig, mod);

        const lines = [];
        let oldNum = 0;
        let newNum = 0;

        for (const part of parts) {
            let lineTexts = part.value.split('\n');

            if (part.value.endsWith('\n') && lineTexts.length > 0 && lineTexts[lineTexts.length - 1] === '') {
                lineTexts = lineTexts.slice(0, -1);
            }

            if (lineTexts.length === 0 && part.value !== '') {
                lineTexts = [part.value];
            }

            for (const text of lineTexts) {
                if (part.removed) {
                    oldNum++;
                    lines.push({ text, type: 'removed', oldNum, newNum: null });
                } else if (part.added) {
                    newNum++;
                    lines.push({ text, type: 'added', oldNum: null, newNum });
                } else {
                    oldNum++;
                    newNum++;
                    lines.push({ text, type: 'unchanged', oldNum, newNum });
                }
            }
        }

        self.postMessage({ id, lines });
    } catch (error) {
        self.postMessage({ id, error: error.message });
    }
};
