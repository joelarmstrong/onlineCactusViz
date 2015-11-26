#!/usr/bin/env Rscript
library(ggplot2)
library(reshape2)
usage <- function() {
    cat("Usage: cactusOpsPlots.R cactusDumpFile outputPrefix\n")
}

# Parse arguments
args <- commandArgs(TRUE)
if (length(args) != 2) {
    usage()
    stop("Invalid arguments")
}
dumpPath <- args[1]
outputPrefix <- args[2]

# Read in the dump file, filter for the lines that contain the
# cactus ops statistics, and create a data frame with proper columns.
rawDump <- strsplit(readLines(file(dumpPath)), "\t")
lines <- Filter(function(x) x[1] %in% c("BATCH", "STEP"), rawDump)
df <- data.frame(Type=character(), NumAlignments=integer(),
                 NumPinches=integer(), TotalOps=integer(),
                 MergeOps=integer(), SplitOps=integer(),
                 EdgeAddOps=integer(), EdgeDeleteOps=integer(),
                 NodeAddOps=integer(), NodeDeleteOps=integer())
for (i in 1:length(lines)) {
    row <- lines[[i]]
    if (row[1] == "STEP") {
        row <- row[-2]
    }
    df[nrow(df)+1,1] <- row[1]
    df[nrow(df),2:length(row)] <- sapply(row[2:length(row)], as.integer)
}

df$Index <- as.integer(row.names(df))

pdf(paste(outputPrefix, "_cumulative_totalOps", ".pdf", sep=""))
print(ggplot(df, aes(x=Index,y=TotalOps,group=1)) + geom_line() + theme_bw())
dev.off()

melted <- melt(df[,!(names(df) %in% c("NumAlignments", "NumPinches", "Type", "TotalOps"))], id.var="Index")
pdf(paste(outputPrefix, "_cumulative_byType", ".pdf", sep=""))
print(ggplot(melted, aes(x=Index,y=value,fill=variable)) + geom_bar(stat="identity") + scale_fill_brewer(type="qual", "Cactus Operations") + theme_bw() + geom_line(data=melt(df,id.var="Index",measure.vars=c("NumPinches", "NumAlignments")), aes(x=Index,y=value,fill=NA,linetype=variable)) + guides(fill = guide_legend(reverse=T), linetype = guide_legend(title="Pinch Operations")) + xlab("Time index") + ggtitle("Cumulative cactus graph operations vs. pinch operations"))
dev.off()
