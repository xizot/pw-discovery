import path from 'path';
import os from 'os';
import fs from 'fs';

import { expect, test } from '@playwright/test';
import { parse } from 'csv-parse/sync';


/*
Sample csv file:

STT,Tên học sinh,Lớp,Điểm Toán,Điểm Lý,Điểm Hóa
1,Nguyễn Văn A,10A1,8,7,9
2,Trần Thị B,10A2,9,6,8
*/
const originHeaderRow = "STT,Tên học sinh,Lớp,Điểm Toán,Điểm Lý,Điểm Hóa";
const headerMapping = new Map<string, string>([
    ['STT', 'no'],
    ['Tên học sinh', 'fullname'],
    ['Lớp', 'class'],
    ['Điểm Toán', 'math_point'],
    ['Điểm Lý', 'physics_point'],
    ['Điểm Hóa', 'chemistry_point'],
]);
const newRecords = [
    { no: "", fullname: "Nguyễn Văn Nam", class: "10A6", math_point: "8", physics_point: "8", chemistry_point: "8" },
    { no: "", fullname: "Trần Thị Nga", class: "10A6", math_point: "9", physics_point: "9", chemistry_point: "9" },
];

function buildUniqueKey(fullname: string, className: string): string {
    return `${fullname} - ${className}`
}


test('2024-09-27 challenge', async ({ page }) => {
    await page.goto("https://material.playwrightvn.com/021-import-export.html");

    // export to CSV
    const tmpDir = os.tmpdir();
    const downloadPromise = page.waitForEvent('download');
    await page.locator("#exportButton").click();

    const downloadFile = await downloadPromise;
    const savedPath = path.join(tmpDir, downloadFile.suggestedFilename());
    await downloadFile.saveAs(savedPath);

    // read and parse downloaded CSV, re-mapping header
    const fileContent = fs.readFileSync(savedPath, { encoding: 'utf-8' });
    const records = parse(fileContent, {
        delimiter: ',',
        trim: true,
        skip_empty_lines: true,
        columns: (headers) => {
            return headers.map(header => headerMapping.get(header));
        },
    });

    // transform data
    // remove 10A3 class
    let updatedRecords = records.filter(record => record.class != "10A3");
    // append new records and re-index
    updatedRecords = [...updatedRecords, ...newRecords];
    updatedRecords.forEach((record, index) => {
        record.no = String(index + 1);
    });

    // write back to CSV file
    const toImportCsvPath = path.join(tmpDir, "student_to_import.csv");
    let csvBuffer = '';
    csvBuffer += originHeaderRow;
    for (const record of updatedRecords) {
        csvBuffer += '\n' + Object.values(record).join(',');
    }
    fs.writeFileSync(toImportCsvPath, csvBuffer);

    // clicking import back
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('#importButton').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(toImportCsvPath);

    // assert
    // 1. ensure no class 10A3 is shown
    let rows = await page.locator('#studentTable tbody tr').all();
    for (const row of rows) {
        if (await row.isVisible()) {
            const classCell = row.locator('td').nth(2);
            const classCellValue = await classCell.innerText();
            expect(classCellValue).not.toBe('10A3');
        }
    }

    // 2. check new records are added and show index correctly
    const recordsSet: Set<String> = new Set();
    let counter = 1;
    for (const row of rows) {
        if (await row.isVisible()) {
            const no = await row.locator('td').nth(0).innerText();
            expect(no).toBe(String(counter));
            counter++;

            const fullName = await row.locator('td').nth(1).innerText();
            const className = await row.locator('td').nth(2).innerText();
            recordsSet.add(buildUniqueKey(fullName, className));
        }
    }

    for (const record of newRecords) {
        expect(recordsSet.has(buildUniqueKey(record.fullname,record.class))).toBe(true);
    }

    // cleanup
    await downloadFile.delete();
    fs.rmSync(toImportCsvPath, { force: true });
    fs.rmSync(savedPath, { force: true });
})