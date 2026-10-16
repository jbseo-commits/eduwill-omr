#!/usr/bin/env perl
# Keep the offline HTML importers from treating a chart tab as an answer sheet.
# Run after copying generated HTML. Validate every target before writing any file.
use strict;
use warnings;

@ARGV or die "Usage: workbook_sheet_fix.pl <html> [<html> ...]\n";
my $helper = <<'JS';
// Workbook sheet selection start
function workbookRows(wb,options){
 for(const name of wb.SheetNames){
  const ws=wb.Sheets[name];
  if(!ws||ws['!type']==='chart')continue;
  const rows=XLSX.utils.sheet_to_json(ws,options);
  let populated=0;
  for(const row of rows){
   if(row.some(cell=>cell!=null&&String(cell).trim()!=='')&&++populated===2)return rows;
  }
 }
 return [];
}
// Workbook sheet selection end
JS

my $old_normal = 'ROWS=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:null});';
my $new_normal = 'ROWS=workbookRows(wb,{header:1,defval:null});';
my $old_cumulative = qr/const ws = wb\.Sheets\[wb\.SheetNames\[0\]\];\r?\n[ \t]*res\(XLSX\.utils\.sheet_to_json\(ws, \{header:1, raw:true, defval:null\}\)\);/;
my $new_cumulative = 'res(workbookRows(wb, {header:1, raw:true, defval:null}));';
my @prepared;

for my $file (@ARGV) {
 open(my $in, '<:raw', $file) or die "Cannot read $file: $!\n";
 local $/;
 my $data = <$in>;
 close($in) or die "Cannot close $file: $!\n";
 my $before = $data;
 my $markers = () = $data =~ m{// Workbook sheet selection start}g;
 my $normal = () = $data =~ /\Q$old_normal\E/g;
 my $cumulative = () = $data =~ /$old_cumulative/g;
 my $calls = () = $data =~ /\Q$new_normal\E|\Q$new_cumulative\E/g;

 if ($markers) {
  die "Incomplete or duplicate sheet patch in $file\n"
    unless $markers == 1 && $normal + $cumulative == 0 && $calls == 1
      && $data =~ m{// Workbook sheet selection end};
  print "Already patched: $file\n";
  next;
 }

 die "Expected exactly one old sheet importer in $file; found " . ($normal + $cumulative) . "\n"
   unless $normal + $cumulative == 1 && $calls == 0;
 my $anchors = () = $data =~ /^function (?:load|readFile)\(f\)\{/mg;
 die "Expected exactly one importer function in $file; found $anchors\n" unless $anchors == 1;

 my $eol = $data =~ /\r\n/ ? "\r\n" : "\n";
 my $insert = $helper;
 $insert =~ s/\n/$eol/g;
 $data =~ s/^(function (?:load|readFile)\(f\)\{)/$insert$1/m;
 if ($normal) { $data =~ s/\Q$old_normal\E/$new_normal/; }
 else { $data =~ s/$old_cumulative/$new_cumulative/; }
 push @prepared, [$file, $data, length($before)];
}

for my $entry (@prepared) {
 my ($file, $data, $before) = @$entry;
 open(my $out, '>:raw', $file) or die "Cannot write $file: $!\n";
 print $out $data or die "Cannot write $file: $!\n";
 close($out) or die "Cannot close $file: $!\n";
 printf "Patched %s: %d -> %d bytes\n", $file, $before, length($data);
}
